import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { listPetUserIds } from "@/lib/db/pet";

/**
 * PostgREST can cap a response below the requested range. The pager must
 * follow the rows it actually received until a page comes back empty.
 */
function cappedClient(ids: readonly string[], maxRows: number): SupabaseClient {
  return {
    from() {
      let start = 0;
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        range(from: number) {
          start = from;
          return query;
        },
        then(onfulfilled?: ((value: { data: { user_id: string }[]; error: null }) => unknown) | null) {
          const page = ids.slice(start, start + maxRows).map((userId) => ({ user_id: userId }));
          return Promise.resolve({ data: page, error: null }).then(onfulfilled);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

it("keeps paging when each response is shorter than the requested window", async () => {
  const ids = Array.from({ length: 7 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const listed = await listPetUserIds(cappedClient(ids, 3));
  expect(listed).toEqual(ids);
});
