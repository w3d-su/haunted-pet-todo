-- Haunted Pet To-Do: tasks, events, pet_state.
-- clock_offset_ms is a per-user demo offset added to wall time.
-- Do not write last_tick_at ahead of that effective clock; decay treats
-- now < last_tick_at as a no-op.

create extension if not exists pgcrypto;

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
