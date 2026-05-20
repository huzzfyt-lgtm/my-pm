-- =====================================================
-- Migration: unify Notes folders with Projects,
-- link tasks to notes, link lists to projects.
-- Safe to re-run.
-- =====================================================

-- 1. Rename project to match new naming convention ----
update projects
  set name = 'Stolen Hours/Rockea'
  where name = 'Stolen Hours (Rockea)';

-- 2. Add new foreign-key columns ---------------------
alter table notes  add column if not exists project_id uuid references projects(id) on delete set null;
alter table lists  add column if not exists project_id uuid references projects(id) on delete set null;
alter table tasks  add column if not exists note_id    uuid references notes(id)    on delete set null;

-- 3. Backfill notes.project_id from note_folders -----
--    Map by name first. "Stolen Hours/Rockea" now matches a real project.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'note_folders') then
    update notes n
      set project_id = p.id
      from note_folders f
      join projects p on lower(p.name) = lower(f.name)
      where n.folder_id = f.id and n.project_id is null;
  end if;
end $$;

-- 4. Drop the old folder linkage ----------------------
alter table notes  drop column if exists folder_id;
drop table if exists note_folders cascade;

-- 5. Indexes for the new columns ----------------------
create index if not exists notes_project_idx on notes(project_id);
create index if not exists lists_project_idx on lists(project_id);
create index if not exists tasks_note_idx    on tasks(note_id);

-- 6. RLS — personal single-user app, no auth.
--    Make sure inserts and reads from the anon/publishable key are never blocked.
--    Either disable RLS, or (kept here as a belt-and-braces) re-create permissive
--    "anon all" policies in case the table already had RLS enabled.
do $$
declare
  t text;
begin
  for t in select unnest(array['projects','tasks','work_blocks','work_block_tasks','notes','lists','list_items']) loop
    execute format('alter table %I disable row level security', t);
    -- If you prefer to keep RLS on, comment the line above and uncomment below:
    -- execute format('alter table %I enable row level security', t);
    -- if not exists (select 1 from pg_policies where tablename = t and policyname = 'anon all') then
    --   execute format('create policy "anon all" on %I for all using (true) with check (true)', t);
    -- end if;
  end loop;
end $$;
