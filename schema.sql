-- =====================================================
-- Personal Project Manager — Supabase schema
-- Paste this into the Supabase SQL editor and run it.
-- Safe to re-run: every table / index uses IF NOT EXISTS.
-- =====================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- =====================================================
-- projects
-- =====================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#007AFF',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- =====================================================
-- tasks
-- =====================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text default '',
  due_date date,
  priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  time_estimate numeric default 0,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  recurring text not null default 'none' check (recurring in ('none','daily','weekly','monthly')),
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tasks_project_idx on tasks(project_id);
create index if not exists tasks_status_idx  on tasks(status);
create index if not exists tasks_due_idx     on tasks(due_date);
create index if not exists tasks_tags_idx    on tasks using gin (tags);

-- =====================================================
-- work_blocks
-- =====================================================
create table if not exists work_blocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists work_block_tasks (
  work_block_id uuid not null references work_blocks(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (work_block_id, task_id)
);
create index if not exists wbt_block_idx on work_block_tasks(work_block_id);
create index if not exists wbt_task_idx  on work_block_tasks(task_id);

-- =====================================================
-- NOTES (Notes section)
-- =====================================================
create table if not exists note_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#FFD60A',
  icon text default '📁',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  body text not null default '',
  folder_id uuid references note_folders(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  word_count integer not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_folder_idx  on notes(folder_id);
create index if not exists notes_updated_idx on notes(updated_at desc);
create index if not exists notes_pinned_idx  on notes(pinned);

-- =====================================================
-- LISTS (Lists section)
-- =====================================================
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '📋',
  color_gradient text default 'linear-gradient(135deg,#5856D6,#7C3AED)',
  category text not null default 'workspace' check (category in ('workspace','personal')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  text text not null,
  checked boolean not null default false,
  tag text,
  sort_order integer not null default 0,
  due_date date,
  created_at timestamptz not null default now()
);
create index if not exists list_items_list_idx on list_items(list_id);

-- =====================================================
-- Row Level Security — anon read/write (personal use)
-- =====================================================
alter table projects        enable row level security;
alter table tasks           enable row level security;
alter table work_blocks     enable row level security;
alter table work_block_tasks enable row level security;
alter table note_folders    enable row level security;
alter table notes           enable row level security;
alter table lists           enable row level security;
alter table list_items      enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['projects','tasks','work_blocks','work_block_tasks','note_folders','notes','lists','list_items']) loop
    if not exists (select 1 from pg_policies where tablename=t and policyname='anon all') then
      execute format('create policy "anon all" on %I for all using (true) with check (true)', t);
    end if;
  end loop;
end $$;
