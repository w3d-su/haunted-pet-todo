import { readdirSync, readFileSync } from "node:fs";
import type { Pool } from "pg";
import { assertSafeTestDatabase } from "./guard";

/** Drop and recreate public + auth, then apply bootstrap and every migration. */
export async function resetDatabase(pool: Pool): Promise<void> {
  const databaseUrl = process.env.HAUNTED_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("HAUNTED_TEST_DATABASE_URL is not set");
  assertSafeTestDatabase(databaseUrl);
  const current = await pool.query<{ name: string }>("select current_database() as name");
  const connected = String(current.rows[0]?.name ?? "");
  if (!connected.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to drop schemas: current_database() is "${connected || "(unknown)"}", which does not contain "test".`,
    );
  }
  await pool.query("drop schema if exists public cascade");
  await pool.query("drop schema if exists auth cascade");
  await pool.query("create schema public");
  await pool.query(readFileSync("tests/db/bootstrap.sql", "utf8"));
  const migrations = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    await pool.query(readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
}
