-- Timeline order. `created_at` can tie when several rows are inserted
-- in one transaction (complete_task). `seq` cannot.
-- Existing rows are numbered by (created_at, id), not by physical order.
-- The identity sequence continues after that max.

alter table public.events add column seq bigint;

update public.events as event
set seq = numbered.n
from (
  select id, row_number() over (order by created_at, id) as n
  from public.events
) as numbered
where event.id = numbered.id;

alter table public.events alter column seq set not null;

alter table public.events alter column seq add generated always as identity;

select setval(
  pg_get_serial_sequence('public.events', 'seq'),
  greatest(coalesce((select max(seq) from public.events), 1), 1),
  (select exists (select 1 from public.events))
);

create index events_user_seq_idx on public.events (user_id, seq);

comment on column public.events.seq is
  'Monotonic timeline order. Readers order by seq, not created_at.';

revoke all on sequence public.events_seq_seq from public, anon, authenticated;
