-- ===========================================
-- TASKMASTER - FULL REFERENCE SCHEMA
-- ===========================================
-- This is the complete table set from the original project spec, kept
-- here as a reference. Add these tables incrementally as each module is
-- built (rather than all at once), adjusting foreign keys to point at
-- public.users the way foundation_schema.sql does, and adding matching
-- RLS policies for each new table.


CREATE TABLE departments (
    department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_name VARCHAR(150) NOT NULL,
    department_head UUID REFERENCES public.users(user_id),
    description TEXT,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE employees (
    employee_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE,
    employee_code VARCHAR(30) UNIQUE,
    photo_url TEXT,
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    gender VARCHAR(20),
    dob DATE,
    blood_group VARCHAR(10),
    email VARCHAR(150),
    phone VARCHAR(20),
    alternate_phone VARCHAR(20),
    department_id UUID REFERENCES departments(department_id),
    designation VARCHAR(100),
    manager_id UUID REFERENCES employees(employee_id),
    joining_date DATE,
    salary NUMERIC(12,2),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    pincode VARCHAR(20),
    qualification TEXT,
    experience VARCHAR(100),
    aadhar_no VARCHAR(20),
    pan_no VARCHAR(20),
    bank_name VARCHAR(150),
    account_number VARCHAR(50),
    ifsc VARCHAR(20),
    resume_url TEXT,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE interns (
    intern_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE,
    photo_url TEXT,
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    gender VARCHAR(20),
    dob DATE,
    email VARCHAR(150),
    phone VARCHAR(20),
    college VARCHAR(200),
    department_id UUID REFERENCES departments(department_id),
    guide VARCHAR(150),
    mentor UUID REFERENCES employees(employee_id),
    project TEXT,
    duration VARCHAR(100),
    start_date DATE,
    end_date DATE,
    skills TEXT,
    evaluation TEXT,
    certificate_url TEXT,
    status VARCHAR(30) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(250),
    description TEXT,
    priority VARCHAR(20),
    status VARCHAR(30) DEFAULT 'Pending',
    assigned_by UUID REFERENCES public.users(user_id),
    assigned_to UUID REFERENCES public.users(user_id),
    department_id UUID REFERENCES departments(department_id),
    start_date DATE,
    due_date DATE,
    completed_date DATE,
    estimated_hours NUMERIC(6,2),
    actual_hours NUMERIC(6,2),
    progress INTEGER DEFAULT 0,
    remarks TEXT,
    extension_requested BOOLEAN DEFAULT FALSE,
    extension_reason TEXT,
    extended_date DATE,
    approval_status VARCHAR(30) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(task_id) ON DELETE CASCADE,
    file_url TEXT,
    uploaded_by UUID REFERENCES public.users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(task_id) ON DELETE CASCADE,
    title TEXT,
    status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE attendance (
    attendance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id),
    attendance_date DATE,
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    working_hours NUMERIC(5,2),
    status VARCHAR(30),
    gps_location TEXT,
    device TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE holidays (
    holiday_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150),
    holiday_date DATE,
    description TEXT
);

CREATE TABLE leave_applications (
    leave_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id),
    leave_type VARCHAR(100),
    reason TEXT,
    from_date DATE,
    to_date DATE,
    days INTEGER,
    status VARCHAR(30) DEFAULT 'Pending',
    approved_by UUID REFERENCES public.users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE daily_reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id),
    report_date DATE,
    completed_work TEXT,
    pending_work TEXT,
    hours NUMERIC(5,2),
    challenge TEXT,
    tomorrow_plan TEXT,
    manager_remark TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE performance_reviews (
    review_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(employee_id),
    review_date DATE,
    rating NUMERIC(3,1),
    remark TEXT,
    reviewed_by UUID REFERENCES public.users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE intern_evaluations (
    evaluation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intern_id UUID REFERENCES interns(intern_id),
    mentor_id UUID REFERENCES employees(employee_id),
    score NUMERIC(5,2),
    remark TEXT,
    completion_status VARCHAR(30),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
    post_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id),
    content TEXT,
    image_url TEXT,
    video_url TEXT,
    file_url TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE comments (
    comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(post_id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(user_id),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(250),
    message TEXT,
    receiver_id UUID REFERENCES public.users(user_id),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE meetings (
    meeting_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200),
    meeting_date DATE,
    meeting_time TIME,
    meeting_link TEXT,
    description TEXT,
    created_by UUID REFERENCES public.users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chat_rooms (
    room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_name VARCHAR(150),
    type VARCHAR(30),
    created_by UUID REFERENCES public.users(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(user_id),
    message TEXT,
    file_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE activity_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(user_id),
    activity TEXT,
    device TEXT,
    ip_address VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(100),
    generated_by UUID REFERENCES public.users(user_id),
    file_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
