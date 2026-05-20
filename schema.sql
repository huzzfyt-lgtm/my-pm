-- =====================================================
-- Personal Project Manager — Supabase schema
-- Paste this into the Supabase SQL editor and run it.
-- =====================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- =====================================================
-- projects
-- =====================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6366f1',
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

-- =====================================================
-- work_block_tasks (join table)
-- =====================================================
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
-- Row Level Security
-- Personal-use app, no auth — allow anon read/write.
-- Lock these down if you ever add auth.
-- =====================================================
alter table projects        enable row level security;
alter table tasks           enable row level security;
alter table work_blocks     enable row level security;
alter table work_block_tasks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='projects' and policyname='anon all') then
    create policy "anon all" on projects        for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='tasks' and policyname='anon all') then
    create policy "anon all" on tasks           for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='work_blocks' and policyname='anon all') then
    create policy "anon all" on work_blocks     for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='work_block_tasks' and policyname='anon all') then
    create policy "anon all" on work_block_tasks for all using (true) with check (true);
  end if;
end $$;
