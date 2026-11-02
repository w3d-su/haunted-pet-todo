-- Timeline order. `created_at` can tie when several rows are inserted
-- in one transaction (complete_task). `seq` cannot.
-- Generated always: inserts omit the column and Postgres fills it.

alter table public.events
  add column seq bigint generated always as identity;

create index events_user_seq_idx on public.events (user_id, seq);

comment on column public.events.seq is
  'Monotonic timeline order. Readers order by seq, not created_at.';
