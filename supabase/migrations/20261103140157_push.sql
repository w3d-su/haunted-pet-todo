-- Web Push subscriptions. Authenticated clients may only read their own
-- rows. Inserts and deletes go through the service role, which bypasses RLS.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) > 0),
  p256dh text not null check (char_length(p256dh) > 0),
  auth text not null check (char_length(auth) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

create policy "users read own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);
