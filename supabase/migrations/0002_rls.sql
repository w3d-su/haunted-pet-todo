-- Authenticated clients may only read their own rows. Writes go through
-- the service role, which bypasses RLS. That keeps hp, status, and
-- clock_offset_ms off the public PostgREST surface.

alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.pet_state enable row level security;

revoke all on table public.tasks from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.pet_state from anon, authenticated;

grant select on public.tasks to authenticated;
grant select on public.events to authenticated;
grant select on public.pet_state to authenticated;

create policy "users read own tasks"
  on public.tasks
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users read own events"
  on public.events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users read own pet"
  on public.pet_state
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on function public.complete_task(uuid, uuid, integer, timestamptz, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_task(uuid, uuid, integer, timestamptz, jsonb, jsonb, jsonb)
  to service_role;
