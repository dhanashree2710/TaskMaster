-- ===========================================
-- PATCH: wall post visibility + attendance uniqueness
-- ===========================================
-- Safe to re-run. Run this in the Supabase SQL editor.

-- Wall posts: optional list of roles allowed to see a post.
-- NULL (or empty array) means "everyone" — this keeps every existing
-- post visible to everyone exactly as before.
alter table public.posts add column if not exists visible_roles text[];

-- One attendance row per person per day, so an admin adding/correcting a
-- record (e.g. marking someone Absent) updates that day instead of
-- creating a duplicate.
do $$
begin
  alter table public.attendance
    add constraint attendance_user_date_unique unique (user_id, attendance_date);
exception when duplicate_table or duplicate_object then
  raise notice 'attendance_user_date_unique already exists, skipping.';
end $$;

notify pgrst, 'reload schema';
