/**
 * Postgres checks for push subscriptions.
 * Skips unless HAUNTED_TEST_DATABASE_URL names a database containing "test".
 */
import { Pool } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { takeAiBudget } from "@/lib/db/ai-budget";
import { claimNagDay } from "@/lib/db/nag";
import {
  deletePushSubscription,
  listPushSubscriptions,
  upsertPushSubscription,
} from "@/lib/db/push";
import { PushCapError } from "@/lib/server/http";
import { USER_ID } from "../helpers/world";
import { assertSafeTestDatabase } from "./guard";
import { createPgSupabase } from "./pg-supabase";
import { resetDatabase } from "./prepare";

const databaseUrl = process.env.HAUNTED_TEST_DATABASE_URL;
if (databaseUrl) assertSafeTestDatabase(databaseUrl);

const describeDb = databaseUrl ? describe : describe.skip;

describeDb("postgres push subscriptions", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const supabase = createPgSupabase(pool);

  beforeAll(async () => {
    await resetDatabase(pool);
    await pool.query("insert into auth.users (id) values ($1)", [USER_ID]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("upserts one row per user and endpoint, then deletes it", async () => {
    await pool.query("truncate public.push_subscriptions");
    await upsertPushSubscription(supabase, USER_ID, {
      endpoint: "https://push.example/haunt",
      p256dh: "first",
      auth: "auth",
    });
    await upsertPushSubscription(supabase, USER_ID, {
      endpoint: "https://push.example/haunt",
      p256dh: "second",
      auth: "auth",
    });
    const listed = await listPushSubscriptions(supabase, USER_ID);
    expect(listed).toEqual([
      { endpoint: "https://push.example/haunt", p256dh: "second", auth: "auth", locale: "en" },
    ]);
    await deletePushSubscription(supabase, USER_ID, "https://push.example/haunt");
    expect(await listPushSubscriptions(supabase, USER_ID)).toEqual([]);
  });

  it("stores zh-TW and rejects any other locale", async () => {
    await pool.query("truncate public.push_subscriptions");
    await upsertPushSubscription(supabase, USER_ID, {
      endpoint: "https://push.example/zh",
      p256dh: "k",
      auth: "a",
      locale: "zh-TW",
    });
    expect(await listPushSubscriptions(supabase, USER_ID)).toEqual([
      { endpoint: "https://push.example/zh", p256dh: "k", auth: "a", locale: "zh-TW" },
    ]);
    await expect(
      pool.query(
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale)
         values ($1, 'https://push.example/bad', 'k', 'a', 'zh-CN')`,
        [USER_ID],
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it("refuses a sixth subscription and counts model calls once", async () => {
    await pool.query("truncate public.push_subscriptions, public.ai_budget, public.user_nag");
    for (let index = 0; index < 5; index += 1) {
      await upsertPushSubscription(supabase, USER_ID, {
        endpoint: `https://fcm.googleapis.com/fcm/send/${index}`,
        p256dh: "k",
        auth: "a",
      });
    }
    await expect(
      upsertPushSubscription(supabase, USER_ID, {
        endpoint: "https://fcm.googleapis.com/fcm/send/sixth",
        p256dh: "k",
        auth: "a",
      }),
    ).rejects.toBeInstanceOf(PushCapError);
    expect(await listPushSubscriptions(supabase, USER_ID)).toHaveLength(5);

    expect(await takeAiBudget(supabase, USER_ID, Date.UTC(2026, 6, 4))).toBe(true);
    process.env.AI_DAILY_CAP = "1";
    try {
      expect(await takeAiBudget(supabase, USER_ID, Date.UTC(2026, 6, 4))).toBe(false);
    } finally {
      delete process.env.AI_DAILY_CAP;
    }
    const used = await pool.query("select used from public.ai_budget where scope = 'site'");
    expect(used.rows[0]?.used).toBe(1);

    expect(await claimNagDay(supabase, USER_ID, "2026-07-04")).toBe(true);
    expect(await claimNagDay(supabase, USER_ID, "2026-07-04")).toBe(false);
    expect(await claimNagDay(supabase, USER_ID, "2026-07-05")).toBe(true);
  });

  it("keeps exactly five rows when twenty inserts race", async () => {
    await pool.query("truncate public.push_subscriptions");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        pool
          .query(
            `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
             values ($1, $2, 'k', 'a')`,
            [USER_ID, `https://fcm.googleapis.com/fcm/send/race-${index}`],
          )
          .then(() => "ok" as const)
          .catch((error: { message?: string }) => {
            expect(error.message ?? "").toMatch(/push subscription cap/i);
            return "cap" as const;
          }),
      ),
    );
    expect(results.filter((result) => result === "ok")).toHaveLength(5);
    const count = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.push_subscriptions where user_id = $1",
      [USER_ID],
    );
    expect(count.rows[0]?.n).toBe("5");
  });

  it("lets authenticated clients select and not write", async () => {
    const privileges = await pool.query<{
      read: boolean;
      insert: boolean;
      update: boolean;
      delete: boolean;
    }>(
      `select
         has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT') as read,
         has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT') as insert,
         has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE') as update,
         has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE') as delete`,
    );
    expect(privileges.rows[0]).toEqual({
      read: true,
      insert: false,
      update: false,
      delete: false,
    });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await expect(
        client.query(
          `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
           values ($1, 'https://push.example/nope', 'k', 'a')`,
          [USER_ID],
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});

it("falls back to English when the locale column is not migrated yet", async () => {
  const missing = {
    message: 'column "locale" of relation "push_subscriptions" does not exist',
    code: "42703",
  };
  const rows = [
    {
      user_id: USER_ID,
      endpoint: "https://push.example/old",
      p256dh: "k",
      auth: "a",
    },
  ];
  let upserts = 0;
  const supabase = {
    from() {
      return {
        select(columns: string) {
          return {
            eq() {
              if (columns.includes("locale")) return Promise.resolve({ data: null, error: missing });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
        upsert(values: { locale?: string }) {
          upserts += 1;
          if ("locale" in values) return Promise.resolve({ error: missing });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  await upsertPushSubscription(supabase, USER_ID, {
    endpoint: "https://push.example/old",
    p256dh: "k",
    auth: "a",
    locale: "zh-TW",
  });
  expect(upserts).toBe(2);
  expect(await listPushSubscriptions(supabase, USER_ID)).toEqual([
    { endpoint: "https://push.example/old", p256dh: "k", auth: "a", locale: "en" },
  ]);
});
