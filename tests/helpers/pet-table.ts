import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Result = { data: Row | null; error: { message: string; code?: string } | null };

export interface PetTable {
  client: SupabaseClient;
  stored(): Row | null;
}

/** In-memory `pet_state` table with the query chain `getPetState` / `savePetState` use. */
export function createPetTable(seed: Row | null): PetTable {
  let row = seed;
  const client = {
    from(table: string) {
      if (table !== "pet_state") throw new Error(`unexpected table ${table}`);
      const query = {
        action: "select" as "select" | "insert" | "update",
        payload: null as Row | null,
        filters: [] as Array<[string, unknown]>,
      };
      const run = (): Result => {
        if (query.action === "insert" && query.payload) {
          if (row) return { data: null, error: { message: "duplicate", code: "23505" } };
          row = { clock_offset_ms: 0, ...query.payload };
          return { data: row, error: null };
        }
        const matches =
          row !== null && query.filters.every(([column, value]) => row?.[column] === value);
        if (query.action === "update" && query.payload) {
          if (!matches || row === null) return { data: null, error: null };
          row = { ...row, ...query.payload };
          return { data: row, error: null };
        }
        return { data: matches ? row : null, error: null };
      };
      const builder = {
        select() {
          return builder;
        },
        insert(payload: Row) {
          query.action = "insert";
          query.payload = payload;
          return builder;
        },
        update(payload: Row) {
          query.action = "update";
          query.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          query.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(run());
        },
        single() {
          return Promise.resolve(run());
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return {
    client,
    stored: () => row,
  };
}
