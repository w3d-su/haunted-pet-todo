-- RLS: a signed-in user (including an anonymous Supabase user) may touch
-- only rows whose user_id equals auth.uid(). events are append-only.

alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.pet_state enable row level security;

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.pet_state to authenticated;
grant insert on public.events to authenticated;

create policy "users manage own tasks"
  on public.tasks
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users insert own events"
  on public.events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users manage own pet"
  on public.pet_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
