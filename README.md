# TaskMaster

TaskMaster is a static HTML/CSS/JS workspace for tasks, people, attendance, reports, and team operations. It uses Bootstrap for layout helpers, custom responsive styling, and Supabase only as the database.

## Current Auth Model

Supabase Auth has been removed from the app flow. Login and registration use only the `public.users` table.

- `index.html` signs in by checking `user_email`, `user_password`, and `status` in `public.users`.
- Successful login stores the current user in `localStorage`.
- `register.html` is no longer linked from the login page.
- Only logged-in `Super Admin`, `Admin`, and `Manager` users can access `register.html`.
- `forgot-password.html` is now an access-help page that checks whether an email exists.
- `reset-password.html` explains that password changes are managed by admins/managers.

## Included Pages

- `index.html` - private workspace sign in.
- `dashboard.html` - full app: Dashboard, Tasks, Employees, Interns, Attendance, Leave, Reports, Wall, Chat, Meetings, Admin Panel, and Settings, all in one role-aware single-page shell.
- `register.html` - protected managed user registration (also creates the matching `employees`/`interns` row).
- `forgot-password.html` - account access help.
- `reset-password.html` - stale reset-link fallback.

## Modules

Every module below reads and writes Supabase directly and includes filters:

- **Tasks** - kanban/list views, assign to teammates, checklists, progress, extension requests/approvals. Filters: status, priority, assignee, search.
- **Employees / Interns** - directories linked to `public.users` (created automatically by Register User), department & mentor linking, profile editing. Filters: search, department/status.
- **Attendance** - check-in/check-out, working hours, team view for managers with **Employees / Interns / Everyone tabs** (driven by `users.role`). Filters: date range, status, person.
- **Leave** - apply for leave, manager approve/reject. Filters: status, type, person.
- **Reports** - daily work logs with manager remarks. Filters: date, person.
- **Wall** - company feed with likes and comments.
- **Chat** - rooms with membership, realtime messages.
- **Meetings** - schedule with invitees, upcoming/past filter.
- **Admin Panel** (Super Admin/Admin only) - manage user roles/status, departments, holidays, and an activity audit log.
- **Settings** - profile, password, and notification preferences.

## Notifications

Every module writes rows into `public.notifications` when something relevant happens (task assigned, leave decided, meeting invite, chat message, etc.). The bell icon in the top bar shows a live, realtime unread count via Supabase Realtime.

For phone alerts, the app also requests the browser's Notification permission and fires a native notification when a new row arrives while the tab (or installed home-screen app) is open. `manifest.json` lets people "Add to Home Screen" on iOS/Android for a more native feel. True push notifications that wake the app when it's fully closed require a backend push service (e.g. web push + a server), which is outside this static-site setup.

## Registration & Roles

Only **Super Admin**, **Admin**, and **Manager** accounts can register new users (`register.html`). Registering an Employee or Intern always creates two linked rows: one in `public.users` (login/role) and one in `public.employees` or `public.interns` (profile, tied back via `user_id`) - matching every field in your `employees`/`interns` table definitions, including bank/ID details, department, manager/mentor linking, etc. The `users.role` check constraint only allows `Super Admin`, `Admin`, `Manager`, `Employee`, `Intern` - the app's role dropdowns match this exactly.

## Biometric Login

Settings → Security lets a signed-in user enable fingerprint/Face ID sign-in for the current device using the browser's WebAuthn platform authenticator. The credential id is stored in `user_biometric_credentials` (linked to `users.user_id`) and also cached in that browser's local storage. The next time they visit `index.html` on the same device, a "Sign in with biometrics" button appears; tapping it triggers the real OS biometric prompt and, on success, signs them in as that user.

Because this is a static site with no backend, the signed WebAuthn assertion isn't cryptographically verified server-side - a successful OS biometric prompt plus a matching stored credential id is treated as proof of presence. For a production deployment, verify the assertion signature on a server before trusting it.

## Database Setup

Run these two files in the Supabase SQL editor, in order:

1. `supabase/foundation_schema.sql` - users, employees, interns, tasks, attendance, leave, reports, posts, meetings, chat, and a starter Super Admin account.
2. `supabase/modules_schema.sql` - adds `notifications`, `comments`, `task_files`/`task_checklists`, `chat_members`, `meeting_attendees`, `holidays`, `activity_logs`, and `user_biometric_credentials`, and turns on Realtime for `notifications`, `messages`, and `tasks`.

Change the starter admin email/password in `foundation_schema.sql` before running it:

```sql
insert into public.users (user_name, user_email, user_password, role, status)
values ('Super Admin', 'admin@taskmaster.local', 'admin123', 'Super Admin', 'Active')
on conflict (user_email) do nothing;
```

## Supabase Client

Update `assets/js/supabase-client.js` with your project URL and anon key:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';
```

## Run Locally

Open `index.html` directly or serve the folder with any static server.

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.
