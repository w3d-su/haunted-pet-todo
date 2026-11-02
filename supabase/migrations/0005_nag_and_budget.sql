-- Daily nag marker and model-call counters. Authenticated users cannot write.
-- The service role calls the functions. A push insert past five rows per user fails.
--
-- This file was edited in place after it first landed on the Week 3 branch.
-- It is not on main yet. If a local database already applied an earlier copy
-- of 0005, reset it before relying on the advisory lock or search_path:
--   supabase db reset

create table public.user_nag (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_nag_day date not null
);

alter table public.user_nag enable row level security;
revoke all on table public.user_nag from anon, authenticated;
grant select on public.user_nag to authenticated;

create policy "users read own nag day"
  on public.user_nag
  for select
  to authenticated
  using (auth.uid() = user_id);

create table public.ai_budget (
  scope text not null,
  day date not null,
  used integer not null check (used >= 0),
  primary key (scope, day)
);

alter table public.ai_budget enable row level security;
revoke all on table public.ai_budget from anon, authenticated;

-- True only when this day was not already claimed. A second call the same day is false.
create function public.claim_nag_day(p_user_id uuid, p_day date)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  claimed uuid;
begin
  insert into public.user_nag as nag (user_id, last_nag_day)
  values (p_user_id, p_day)
  on conflict (user_id) do update
    set last_nag_day = excluded.last_nag_day
    where nag.last_nag_day is distinct from excluded.last_nag_day
  returning nag.user_id into claimed;
  return claimed is not null;
end;
$$;

revoke all on function public.claim_nag_day(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_nag_day(uuid, date) to service_role;

-- Counts one model attempt against the user cap and the site cap.
-- A refused attempt is not counted. A user miss rolls the site count back.
create function public.take_ai_budget(
  p_user_id uuid,
  p_day date,
  p_user_cap integer,
  p_site_cap integer
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  site_used integer;
  user_used integer;
begin
  if p_user_cap < 1 or p_site_cap < 1 then
    return false;
  end if;

  insert into public.ai_budget as budget (scope, day, used)
  values ('site', p_day, 1)
  on conflict (scope, day) do update
    set used = budget.used + 1
    where budget.used < p_site_cap
  returning budget.used into site_used;

  if site_used is null then
    return false;
  end if;

  insert into public.ai_budget as budget (scope, day, used)
  values ('user:' || p_user_id::text, p_day, 1)
  on conflict (scope, day) do update
    set used = budget.used + 1
    where budget.used < p_user_cap
  returning budget.used into user_used;

  if user_used is null then
    update public.ai_budget
    set used = public.ai_budget.used - 1
    where public.ai_budget.scope = 'site' and public.ai_budget.day = p_day;
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.take_ai_budget(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.take_ai_budget(uuid, date, integer, integer) to service_role;

create function public.limit_push_subscriptions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.user_id::text));
  if (
    select count(*)
    from public.push_subscriptions
    where user_id = new.user_id
      and endpoint <> new.endpoint
  ) >= 5 then
    raise exception 'push subscription cap' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_cap
  before insert or update on public.push_subscriptions
  for each row
  execute function public.limit_push_subscriptions();
