-- ===========================================
-- PATCH: wall visibility + attendance uniqueness + task file attachments
-- ===========================================
-- Safe to re-run. Run this whole file in the Supabase SQL editor.
-- Covers every schema change the app currently expects that a fresh/older
-- database won't have yet.

-- ---------- 1. Wall posts: optional "visible to these roles only" ----------
-- Fixes: "Could not find the 'visible_roles' column of 'posts' in the
-- schema cache" when creating a post (this also broke "Everyone" posts,
-- since the whole insert fails if the column doesn't exist at all).
-- NULL/empty means "everyone" — keeps every existing post visible to all.
alter table public.posts add column if not exists visible_roles text[];

-- ---------- 2. Attendance: one row per person per day ----------
do $$
begin
  alter table public.attendance
    add constraint attendance_user_date_unique unique (user_id, attendance_date);
exception when duplicate_table or duplicate_object then
  raise notice 'attendance_user_date_unique already exists, skipping.';
end $$;

-- ---------- 3. Task file/photo attachments ----------
create table if not exists public.task_files (
  id uuid not null default uuid_generate_v4(),
  task_id uuid null,
  file_url text null,
  file_name text null,
  uploaded_by uuid null,
  created_at timestamp without time zone null default now(),
  constraint task_files_pkey primary key (id),
  constraint task_files_task_id_fkey foreign key (task_id) references public.tasks (task_id) on delete cascade,
  constraint task_files_uploaded_by_fkey foreign key (uploaded_by) references public.users (user_id)
);

-- Older installs may already have task_files without file_name — add it.
alter table public.task_files add column if not exists file_name text;

-- If task_id's fkey predates the cascade, upgrade it so deleting a task
-- also removes its attachments instead of erroring.
do $$
begin
  alter table public.task_files drop constraint if exists task_files_task_id_fkey;
  alter table public.task_files
    add constraint task_files_task_id_fkey foreign key (task_id) references public.tasks (task_id) on delete cascade;
exception when others then
  raise notice 'task_files_task_id_fkey already up to date, skipping.';
end $$;

alter table public.task_files disable row level security;

-- The task_files storage bucket must be public (like employee_photos,
-- wall_images, etc.) so the URL returned after upload actually resolves.
-- Fixes: attachments upload fine but appear broken/invisible to both the
-- person who assigned the task and the person it's assigned to.
insert into storage.buckets (id, name, public)
values ('task_files', 'task_files', true)
on conflict (id) do update set public = true;

notify pgrst, 'reload schema';
