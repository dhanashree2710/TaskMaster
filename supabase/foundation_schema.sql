-- ===========================================
-- TASKMASTER - FOUNDATION SCHEMA
-- ===========================================
-- Static app database setup. The app uses public.users for login and
-- managed registration. Supabase Auth is not used.

create extension if not exists "uuid-ossp";

create table if not exists public.users (
    user_id uuid primary key default uuid_generate_v4(),
    user_name varchar(150) not null,
    user_email varchar(150) unique not null,
    user_password text not null,
    role varchar(30) not null default 'Employee'
        check (role in ('Super Admin','Admin','Manager','Employee','Intern')),
    status varchar(20) not null default 'Active',
    photo_url text,
    webauthn_credential_id text,
    last_login timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists departments (
    department_id uuid primary key default uuid_generate_v4(),
    department_name varchar(150) not null,
    department_head uuid references public.users(user_id),
    description text,
    status varchar(20) default 'Active',
    created_at timestamptz default now()
);

create table if not exists employees (
    employee_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id) on delete cascade,
    employee_code varchar(30) unique,
    photo_url text,
    first_name varchar(100),
    middle_name varchar(100),
    last_name varchar(100),
    gender varchar(20),
    dob date,
    blood_group varchar(10),
    email varchar(150),
    phone varchar(20),
    alternate_phone varchar(20),
    department_id uuid references departments(department_id),
    designation varchar(100),
    manager_id uuid references employees(employee_id),
    joining_date date,
    salary numeric(12,2),
    address text,
    city varchar(100),
    state varchar(100),
    country varchar(100),
    pincode varchar(20),
    qualification text,
    experience varchar(100),
    aadhar_no varchar(20),
    pan_no varchar(20),
    bank_name varchar(150),
    account_number varchar(50),
    ifsc varchar(20),
    resume_url text,
    status varchar(20) default 'Active',
    created_at timestamptz default now()
);

create table if not exists interns (
    intern_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id) on delete cascade,
    photo_url text,
    first_name varchar(100),
    middle_name varchar(100),
    last_name varchar(100),
    gender varchar(20),
    dob date,
    email varchar(150),
    phone varchar(20),
    college varchar(200),
    department_id uuid references departments(department_id),
    guide varchar(150),
    mentor uuid references employees(employee_id),
    project text,
    duration varchar(100),
    start_date date,
    end_date date,
    skills text,
    evaluation text,
    certificate_url text,
    status varchar(30) default 'Active',
    created_at timestamptz default now()
);

create table if not exists tasks (
    task_id uuid primary key default uuid_generate_v4(),
    title varchar(250),
    description text,
    priority varchar(20),
    status varchar(30) default 'Pending',
    assigned_by uuid references public.users(user_id),
    assigned_to uuid references public.users(user_id),
    department_id uuid references departments(department_id),
    start_date date,
    due_date date,
    completed_date date,
    estimated_hours numeric(6,2),
    actual_hours numeric(6,2),
    progress integer default 0,
    remarks text,
    extension_requested boolean default false,
    extension_reason text,
    extended_date date,
    approval_status varchar(30) default 'Pending',
    created_at timestamptz default now()
);

create table if not exists attendance (
    attendance_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id),
    attendance_date date,
    check_in timestamptz,
    check_out timestamptz,
    working_hours numeric(5,2),
    status varchar(30),
    gps_location text,
    device text,
    remarks text,
    created_at timestamptz default now()
);

create table if not exists leave_applications (
    leave_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id),
    leave_type varchar(100),
    reason text,
    from_date date,
    to_date date,
    days integer,
    status varchar(30) default 'Pending',
    approved_by uuid references public.users(user_id),
    created_at timestamptz default now()
);

create table if not exists daily_reports (
    report_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id),
    report_date date,
    completed_work text,
    pending_work text,
    hours numeric(5,2),
    challenge text,
    tomorrow_plan text,
    manager_remark text,
    created_at timestamptz default now()
);

create table if not exists posts (
    post_id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id),
    content text,
    image_url text,
    video_url text,
    file_url text,
    likes integer default 0,
    comments integer default 0,
    created_at timestamptz default now()
);

create table if not exists meetings (
    meeting_id uuid primary key default uuid_generate_v4(),
    title varchar(200),
    meeting_date date,
    meeting_time time,
    meeting_link text,
    description text,
    created_by uuid references public.users(user_id),
    created_at timestamptz default now()
);

create table if not exists chat_rooms (
    room_id uuid primary key default uuid_generate_v4(),
    room_name varchar(150),
    type varchar(30),
    created_by uuid references public.users(user_id),
    created_at timestamptz default now()
);

create table if not exists messages (
    message_id uuid primary key default uuid_generate_v4(),
    room_id uuid references chat_rooms(room_id) on delete cascade,
    sender_id uuid references public.users(user_id),
    message text,
    file_url text,
    created_at timestamptz default now()
);

create table if not exists reports (
    report_id uuid primary key default uuid_generate_v4(),
    report_type varchar(100),
    generated_by uuid references public.users(user_id),
    file_url text,
    created_at timestamptz default now()
);

alter table public.users disable row level security;
alter table departments disable row level security;
alter table employees disable row level security;
alter table interns disable row level security;
alter table tasks disable row level security;
alter table attendance disable row level security;
alter table leave_applications disable row level security;
alter table daily_reports disable row level security;
alter table posts disable row level security;
alter table meetings disable row level security;
alter table chat_rooms disable row level security;
alter table messages disable row level security;
alter table reports disable row level security;

insert into public.users (user_name, user_email, user_password, role, status)
values ('Super Admin', 'admin@taskmaster.local', 'admin123', 'Super Admin', 'Active')
on conflict (user_email) do nothing;

insert into storage.buckets (id, name, public)
values
  ('employee_photos', 'employee_photos', true),
  ('intern_photos', 'intern_photos', true),
  ('documents', 'documents', false),
  ('task_files', 'task_files', false),
  ('chat_files', 'chat_files', false),
  ('wall_images', 'wall_images', true),
  ('wall_videos', 'wall_videos', true),
  ('reports', 'reports', false),
  ('certificates', 'certificates', false),
  ('resumes', 'resumes', false)
on conflict (id) do nothing;
