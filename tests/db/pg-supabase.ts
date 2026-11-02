import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pool, QueryResultRow } from "pg";

const JSONB_COLUMNS = new Set(["graveyard", "payload"]);
const BIGINT_ARRAY_COLUMNS = new Set(["recent_completion_timestamps"]);
const TEXT_ARRAY_COLUMNS = new Set([
  "recent_completion_categories",
  "recent_completion_task_ids",
]);

type Expectation = "many" | "maybe" | "single" | "none";

interface Filter {
  kind: "eq" | "neq" | "is";
  column: string;
  value: unknown;
}

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unexpected SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function normalizeRow(row: QueryResultRow): QueryResultRow {
  const copy: QueryResultRow = {};
  for (const [key, value] of Object.entries(row)) {
    copy[key] = value instanceof Date ? value.toISOString() : value;
  }
  return copy;
}

function arrayLiteral(value: unknown): string {
  const items = Array.isArray(value) ? value : [];
  const parts = items.map((item) => {
    const text = String(item);
    if (/^[0-9]+$/.test(text)) return text;
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  });
  return `{${parts.join(",")}}`;
}

function bind(column: string, value: unknown): { value: unknown; cast: string } {
  if (value === null || value === undefined) return { value: null, cast: "" };
  if (JSONB_COLUMNS.has(column)) return { value: JSON.stringify(value), cast: "::jsonb" };
  if (BIGINT_ARRAY_COLUMNS.has(column)) return { value: arrayLiteral(value), cast: "::bigint[]" };
  if (TEXT_ARRAY_COLUMNS.has(column)) return { value: arrayLiteral(value), cast: "::text[]" };
  return { value, cast: "" };
}

class Query implements PromiseLike<Result> {
  private action: "select" | "insert" | "update" | "upsert" = "select";
  private values: Record<string, unknown> = {};
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rangeBounds: { from: number; to: number } | null = null;
  private onConflict: string | null = null;
  private expectation: Expectation = "many";

  constructor(
    private readonly pool: Pool,
    private readonly table: string,
  ) {}

  select(): this {
    if (this.expectation === "none") this.expectation = "many";
    return this;
  }

  insert(values: Record<string, unknown>): this {
    this.action = "insert";
    this.values = values;
    this.expectation = "none";
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.action = "update";
    this.values = values;
    this.expectation = "none";
    return this;
  }

  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): this {
    this.action = "upsert";
    this.values = values;
    this.onConflict = options?.onConflict ?? null;
    this.expectation = "none";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ kind: "neq", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  /** Inclusive, matching PostgREST `.range(from, to)`. */
  range(from: number, to: number): this {
    this.rangeBounds = { from, to };
    return this;
  }

  maybeSingle(): Promise<Result> {
    this.expectation = "maybe";
    return this.execute();
  }

  single(): Promise<Result> {
    this.expectation = "single";
    return this.execute();
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private whereClause(placeholder: (column: string, value: unknown) => string): string {
    return this.filters
      .map((filter) => {
        if (filter.kind === "is") return `${ident(filter.column)} is null`;
        const op = filter.kind === "neq" ? "<>" : "=";
        return `${ident(filter.column)} ${op} ${placeholder(filter.column, filter.value)}`;
      })
      .join(" and ");
  }

  private async execute(): Promise<Result> {
    const params: unknown[] = [];
    const placeholder = (column: string, value: unknown): string => {
      const bound = bind(column, value);
      params.push(bound.value);
      return `$${params.length}${bound.cast}`;
    };
    const entries = Object.entries(this.values).filter(([, value]) => value !== undefined);

    let sql: string;
    if (this.action === "select") {
      const where = this.whereClause(placeholder);
      sql = `select * from public.${ident(this.table)}`;
      if (where) sql += ` where ${where}`;
      if (this.orderBy) {
        sql += ` order by ${ident(this.orderBy.column)} ${this.orderBy.ascending ? "asc" : "desc"}`;
      }
      if (this.rangeBounds) {
        const span = this.rangeBounds.to - this.rangeBounds.from + 1;
        sql += ` offset ${placeholder("_offset", this.rangeBounds.from)} limit ${placeholder("_limit", span)}`;
      }
    } else if (this.action === "update") {
      const assignments = entries.map(
        ([column, value]) => `${ident(column)} = ${placeholder(column, value)}`,
      );
      const where = this.whereClause(placeholder);
      sql = `update public.${ident(this.table)} set ${assignments.join(", ")}`;
      if (where) sql += ` where ${where}`;
      if (this.expectation !== "none") sql += " returning *";
    } else {
      const columns = entries.map(([column]) => ident(column)).join(", ");
      const values = entries.map(([column, value]) => placeholder(column, value)).join(", ");
      sql = `insert into public.${ident(this.table)} (${columns}) values (${values})`;
      if (this.action === "upsert" && this.onConflict) {
        const sets = entries
          .filter(([column]) => column !== this.onConflict)
          .map(([column]) => `${ident(column)} = excluded.${ident(column)}`)
          .join(", ");
        sql += ` on conflict (${ident(this.onConflict)}) do update set ${sets}`;
      }
      if (this.expectation !== "none") sql += " returning *";
    }

    try {
      const result = await this.pool.query(sql, params);
      const rows = result.rows.map((row) => normalizeRow(row));
      if (this.expectation === "none") return { data: null, error: null };
      if (this.expectation === "single") {
        if (rows.length !== 1) {
          return {
            data: null,
            error: { message: `Expected 1 row, got ${rows.length}`, code: "PGRST116" },
          };
        }
        return { data: rows[0], error: null };
      }
      if (this.expectation === "maybe") {
        if (rows.length > 1) {
          return { data: null, error: { message: "Multiple rows", code: "PGRST116" } };
        }
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (error) {
      const err = error as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? "query failed", code: err.code } };
    }
  }
}

/**
 * Enough of the Supabase query surface for `src/lib/db` and `completion.ts`.
 * Statements go to node-postgres; the helpers under test are unchanged.
 */
export function createPgSupabase(pool: Pool): SupabaseClient {
  return {
    from(table: string) {
      return new Query(pool, table);
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      if (fn !== "complete_task") {
        return { data: null, error: { message: `Unknown rpc ${fn}` } };
      }
      try {
        const result = await pool.query(
          `select public.complete_task(
            $1::uuid, $2::uuid, $3::integer, $4::timestamptz, $5::jsonb, $6::jsonb, $7::jsonb
          ) as body`,
          [
            args.p_user_id,
            args.p_task_id,
            args.p_expected_version,
            args.p_completed_at,
            JSON.stringify(args.p_task ?? {}),
            JSON.stringify(args.p_pet ?? {}),
            JSON.stringify(args.p_events ?? []),
          ],
        );
        return { data: result.rows[0]?.body ?? null, error: null };
      } catch (error) {
        const err = error as { message?: string; code?: string };
        return { data: null, error: { message: err.message ?? "rpc failed", code: err.code } };
      }
    },
  } as unknown as SupabaseClient;
}
