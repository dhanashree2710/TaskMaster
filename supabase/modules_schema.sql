-- ===========================================
-- TASKMASTER - MODULES SCHEMA (run after foundation_schema.sql)
-- ===========================================
-- Adds the tables needed by the Tasks, Wall, Chat, Meetings,
-- Notifications, and Admin Panel screens. Safe to re-run.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------- Notifications (powers the bell + phone notifications) ----------
create table if not exists notifications (
    notification_id uuid primary key default uuid_generate_v4(),
    title varchar(250),
    message text,
    link varchar(100),
    receiver_id uuid references public.users(user_id) on delete cascade,
    is_read boolean default false,
    created_at timestamptz not null default now()
);
create index if not exists idx_notifications_receiver on notifications(receiver_id, is_read);

-- ---------- Wall comments (posts already exist in foundation_schema) ----------
create table if not exists comments (
    comment_id uuid primary key default uuid_generate_v4(),
    post_id uuid references posts(post_id) on delete cascade,
    user_id uuid references public.users(user_id),
    comment text,
    created_at timestamptz default now()
);

-- ---------- Task attachments / checklists ----------
create table if not exists task_files (
    id uuid primary key default uuid_generate_v4(),
    task_id uuid references tasks(task_id) on delete cascade,
    file_url text,
    file_name text,
    uploaded_by uuid references public.users(user_id),
    created_at timestamptz default now()
);

create table if not exists task_checklists (
    id uuid primary key default uuid_generate_v4(),
    task_id uuid references tasks(task_id) on delete cascade,
    title text,
    status boolean default false,
    created_at timestamptz default now()
);

-- ---------- Chat room membership (links chat_rooms <-> users) ----------
create table if not exists chat_members (
    member_id uuid primary key default gen_random_uuid(),
    room_id uuid references chat_rooms(room_id) on delete cascade,
    user_id uuid references public.users(user_id) on delete cascade,
    joined_at timestamptz default now()
);

-- ---------- Meeting attendees (links meetings <-> users) ----------
create table if not exists meeting_attendees (
    id uuid primary key default uuid_generate_v4(),
    meeting_id uuid references meetings(meeting_id) on delete cascade,
    user_id uuid references public.users(user_id) on delete cascade,
    rsvp varchar(20) default 'Pending',
    created_at timestamptz default now(),
    unique (meeting_id, user_id)
);

-- ---------- Holidays (used by Attendance + Leave filters) ----------
create table if not exists holidays (
    holiday_id uuid primary key default uuid_generate_v4(),
    title varchar(150),
    holiday_date date,
    description text,
    created_at timestamptz default now()
);

-- ---------- Activity log (Admin Panel audit trail) ----------
create table if not exists activity_logs (
    log_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id),
    activity text,
    device text,
    created_at timestamptz default now()
);

-- ---------- Biometric login credentials (WebAuthn) ----------
create table if not exists user_biometric_credentials (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id) on delete cascade,
    credential_id text unique not null,
    device_label text,
    created_at timestamptz default now()
);

alter table notifications disable row level security;
alter table comments disable row level security;
alter table task_files disable row level security;
alter table task_checklists disable row level security;
alter table chat_members disable row level security;
alter table meeting_attendees disable row level security;
alter table holidays disable row level security;
alter table activity_logs disable row level security;
alter table user_biometric_credentials disable row level security;

-- Enable realtime so the notification bell + chat update live.
-- Wrapped so re-running this file doesn't error if already added.
do $$
begin
  begin
    alter publication supabase_realtime add table notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table chat_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table meetings;
  exception when duplicate_object then null;
  end;
end $$;

-- Force PostgREST to pick up every table above immediately instead of
-- waiting for its next automatic schema-cache refresh. This is what was
-- missing before, which caused "Could not find the table ... in the
-- schema cache" errors (e.g. for user_biometric_credentials) even
-- though the table had just been created.
notify pgrst, 'reload schema';
