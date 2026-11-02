/**
 * Postgres checks for push subscriptions.
 * Skips unless HAUNTED_TEST_DATABASE_URL names a database containing "test".
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deletePushSubscription,
  listPushSubscriptions,
  upsertPushSubscription,
} from "@/lib/db/push";
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
      { endpoint: "https://push.example/haunt", p256dh: "second", auth: "auth" },
    ]);
    await deletePushSubscription(supabase, USER_ID, "https://push.example/haunt");
    expect(await listPushSubscriptions(supabase, USER_ID)).toEqual([]);
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
