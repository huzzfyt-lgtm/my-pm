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
