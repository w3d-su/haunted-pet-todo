-- Haunted Pet To-Do: tasks, events, pet_state.
-- clock_offset_ms is a per-user demo offset added to wall time.
-- Do not write last_tick_at ahead of that effective clock; decay treats
-- now < last_tick_at as a no-op.
-- gen_random_uuid() is built into PostgreSQL 13+.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) > 0),
  notes text,
  category text not null default 'other'
    check (category in ('study', 'work', 'chores', 'health', 'creative', 'other')),
  size text not null default 'medium'
    check (size in ('small', 'medium', 'large')),
  status text not null default 'todo'
    check (status in ('todo', 'done', 'overdue')),
  due_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  parent_id uuid references public.tasks (id) on delete cascade,
  breakdown_suggested boolean not null default false,
  all_subtasks_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_parent_id_idx on public.tasks (parent_id);
create index tasks_user_status_idx on public.tasks (user_id, status);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (char_length(event_type) > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_user_created_idx on public.events (user_id, created_at);

create table public.pet_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  time_zone text not null default 'UTC' check (char_length(time_zone) > 0),
  stage text not null check (
    stage in (
      'egg',
      'hatchling',
      'adult',
      'adult_night_owl',
      'adult_early_bird',
      'adult_scholar',
      'adult_haunter'
    )
  ),
  status text not null default 'alive'
    check (status in ('alive', 'dead', 'tombstone')),
  hp double precision not null default 100 check (hp >= 0 and hp <= 100),
  hunger double precision not null default 100 check (hunger >= 0 and hunger <= 100),
  mood double precision not null default 100 check (mood >= 0 and mood <= 100),
  current_streak integer not null default 0 check (current_streak >= 0),
  tasks_completed_total integer not null default 0 check (tasks_completed_total >= 0),
  last_completion_at timestamptz,
  last_completion_day date,
  became_adult_at timestamptz,
  hours_as_adult numeric not null default 0,
  recent_completion_timestamps bigint[] not null default '{}',
  recent_completion_categories text[] not null default '{}',
  recent_completion_task_ids text[] not null default '{}',
  current_epitaph text,
  graveyard jsonb not null default '[]'::jsonb,
  last_tick_at timestamptz,
  died_at timestamptz,
  clock_offset_ms bigint not null default 0 check (clock_offset_ms >= 0),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger pet_state_set_updated_at
  before update on public.pet_state
  for each row execute function public.set_updated_at();

-- service_role only. anon and authenticated cannot execute this.
-- Claim a task, compare-and-swap the pet, and insert events.
-- A version miss raises SQLSTATE HA001 and rolls the claim back.
-- Already-done returns conflict without raising.
create or replace function public.complete_task(
  p_user_id uuid,
  p_task_id uuid,
  p_expected_version integer,
  p_completed_at timestamptz,
  p_task jsonb,
  p_pet jsonb,
  p_events jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
  v_offset bigint;
begin
  update public.tasks
  set
    status = 'done',
    completed_at = p_completed_at,
    title = coalesce(p_task->>'title', title),
    notes = case when p_task ? 'notes' then p_task->>'notes' else notes end,
    category = coalesce(p_task->>'category', category),
    size = coalesce(p_task->>'size', size),
    due_at = case
      when p_task ? 'due_at' then (p_task->>'due_at')::timestamptz
      else due_at
    end,
    sort_order = coalesce((p_task->>'sort_order')::integer, sort_order)
  where id = p_task_id
    and user_id = p_user_id
    and status <> 'done'
    and deleted_at is null;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'conflict');
  end if;

  update public.pet_state
  set
    stage = p_pet->>'stage',
    status = p_pet->>'status',
    hp = (p_pet->>'hp')::double precision,
    hunger = (p_pet->>'hunger')::double precision,
    mood = (p_pet->>'mood')::double precision,
    current_streak = (p_pet->>'current_streak')::integer,
    tasks_completed_total = (p_pet->>'tasks_completed_total')::integer,
    last_completion_at = (p_pet->>'last_completion_at')::timestamptz,
    last_completion_day = (p_pet->>'last_completion_day')::date,
    became_adult_at = (p_pet->>'became_adult_at')::timestamptz,
    hours_as_adult = (p_pet->>'hours_as_adult')::numeric,
    recent_completion_timestamps = coalesce(
      (
        select pg_catalog.array_agg(elem::bigint order by ordinality)
        from pg_catalog.jsonb_array_elements_text(
          coalesce(p_pet->'recent_completion_timestamps', '[]'::jsonb)
        ) with ordinality as listed(elem, ordinality)
      ),
      '{}'::bigint[]
    ),
    recent_completion_categories = coalesce(
      (
        select pg_catalog.array_agg(elem order by ordinality)
        from pg_catalog.jsonb_array_elements_text(
          coalesce(p_pet->'recent_completion_categories', '[]'::jsonb)
        ) with ordinality as listed(elem, ordinality)
      ),
      '{}'::text[]
    ),
    recent_completion_task_ids = coalesce(
      (
        select pg_catalog.array_agg(elem order by ordinality)
        from pg_catalog.jsonb_array_elements_text(
          coalesce(p_pet->'recent_completion_task_ids', '[]'::jsonb)
        ) with ordinality as listed(elem, ordinality)
      ),
      '{}'::text[]
    ),
    current_epitaph = p_pet->>'current_epitaph',
    graveyard = coalesce(p_pet->'graveyard', '[]'::jsonb),
    last_tick_at = (p_pet->>'last_tick_at')::timestamptz,
    died_at = (p_pet->>'died_at')::timestamptz,
    version = public.pet_state.version + 1
  where user_id = p_user_id
    and version = p_expected_version
  returning version, clock_offset_ms into v_version, v_offset;

  if not found then
    raise exception 'version_conflict' using errcode = 'HA001';
  end if;

  insert into public.events (user_id, event_type, payload)
  select
    p_user_id,
    event_row->>'event_type',
    coalesce(event_row->'payload', '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as event_row;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'version', v_version,
    'clock_offset_ms', v_offset
  );
end;
$$;

comment on function public.complete_task(uuid, uuid, integer, timestamptz, jsonb, jsonb, jsonb)
  is 'service_role only';

revoke all on function public.complete_task(uuid, uuid, integer, timestamptz, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_task(uuid, uuid, integer, timestamptz, jsonb, jsonb, jsonb)
  to service_role;
