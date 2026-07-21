const MODULES = [
  { id: 'page-tasks', label: 'Tasks', icon: 'fa-solid fa-list-check', requiresManage: false },
  { id: 'register.html', label: 'Register User', icon: 'fa-solid fa-user-plus', external: true, requiresRegister: true },
  { id: 'page-employees', label: 'Employees', icon: 'fa-solid fa-id-badge', requiresManage: true },
  { id: 'page-interns', label: 'Interns', icon: 'fa-solid fa-user-graduate', requiresManage: true },
  { id: 'page-attendance', label: 'Attendance', icon: 'fa-solid fa-fingerprint', requiresManage: false },
  { id: 'page-leave', label: 'Leave', icon: 'fa-regular fa-calendar-check', requiresManage: false },
  { id: 'page-reports', label: 'Reports', icon: 'fa-solid fa-chart-column', requiresManage: false },
  { id: 'page-wall', label: 'Wall', icon: 'fa-solid fa-layer-group', requiresManage: false },
  { id: 'page-chat', label: 'Chat', icon: 'fa-regular fa-comment-dots', requiresManage: false },
  { id: 'page-meetings', label: 'Meetings', icon: 'fa-solid fa-video', requiresManage: false },
  { id: 'page-admin', label: 'Admin Panel', icon: 'fa-solid fa-user-shield', requiresManage: true },
  { id: 'page-settings', label: 'Settings', icon: 'fa-solid fa-gear', requiresManage: false },
];

let currentProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAuth();
  if (!auth) return;

  currentProfile = auth.profile || { user_name: 'User', role: 'Employee' };

  renderUserChrome(currentProfile);
  applyChromeAvatar(currentProfile);
  renderNav(currentProfile);
  renderModuleSections(currentProfile);
  renderPermissionChrome(currentProfile);
  wireNavigation();
  wireSidebarToggle();
  wireLogout();
  await loadDashboardHome(currentProfile);
  await initNotifications(currentProfile);
  await initAllModules(currentProfile);
});

async function loadDashboardHome(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;
  const today = new Date().toISOString().slice(0, 10);

  try {
    let taskQuery = sb.from('tasks').select('status', { count: 'exact' });
    if (!canManage) taskQuery = taskQuery.eq('assigned_to', profile.user_id);
    const { data: allTasks } = await taskQuery;
    const open = (allTasks || []).filter((t) => t.status !== 'Completed').length;
    const done = (allTasks || []).filter((t) => t.status === 'Completed').length;
    const total = (allTasks || []).length || 1;
    document.getElementById('stat-open-tasks').textContent = open;
    setCompletionRing(Math.round((done / total) * 100));
  } catch (e) { /* table may not have data yet */ }

  try {
    let attQuery = sb.from('attendance').select('user_id', { count: 'exact' }).eq('attendance_date', today).in('status', ['Present', 'Late']);
    if (!canManage) attQuery = attQuery.eq('user_id', profile.user_id);
    const { count } = await attQuery;
    document.getElementById('stat-attendance').textContent = count ?? 0;
  } catch (e) {}

  try {
    let leaveQuery = sb.from('leave_applications').select('leave_id', { count: 'exact' }).eq('status', 'Pending');
    if (!canManage) leaveQuery = leaveQuery.eq('user_id', profile.user_id);
    const { count } = await leaveQuery;
    document.getElementById('stat-leaves').textContent = count ?? 0;
  } catch (e) {}
}

async function initAllModules(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const initializers = [
    ['page-tasks', initTasks, true],
    ['page-employees', initEmployees, roleMeta.canManageTeam],
    ['page-interns', initInterns, roleMeta.canManageTeam],
    ['page-attendance', initAttendance, true],
    ['page-leave', initLeave, true],
    ['page-reports', initReports, true],
    ['page-wall', initWall, true],
    ['page-chat', initChat, true],
    ['page-meetings', initMeetings, true],
    ['page-admin', initAdmin, roleMeta.canManageTeam],
    ['page-settings', initSettings, true],
  ];
  for (const [sectionId, fn, allowed] of initializers) {
    if (!allowed || !document.getElementById(sectionId)) continue;
    try {
      await fn(profile);
    } catch (err) {
      console.error(`Failed to initialize ${sectionId}`, err);
    }
  }
}

function renderUserChrome(profile) {
  const initials = getInitials(profile.user_name);
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = profile.user_name || 'Unnamed user';
  document.getElementById('sidebar-role').textContent = profile.role || 'Employee';
  document.getElementById('greeting').textContent =
    `Welcome back, ${(profile.user_name || '').split(' ')[0] || 'there'}`;
}

async function applyChromeAvatar(profile) {
  try {
    const map = await fetchUserPhotoMap([profile.user_id]);
    const photoUrl = map[profile.user_id] || null;
    setAvatarEl(document.getElementById('sidebar-avatar'), profile.user_name, photoUrl);
    setAvatarEl(document.getElementById('topbar-avatar'), profile.user_name, photoUrl);
  } catch (e) {
    // Non-critical — initials set by renderUserChrome already cover this.
  }
}

function renderPermissionChrome(profile) {
  document.querySelectorAll('[data-register-only]').forEach((item) => {
    item.style.display = canRegisterUsers(profile) ? '' : 'none';
  });
}

function renderNav(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const nav = document.getElementById('sidebar-nav');

  const items = [
    { id: 'page-dashboard', label: 'Dashboard', icon: 'fa-solid fa-grip', always: true },
    ...MODULES.filter((m) => {
      if (m.requiresAdmin) return roleMeta.isAdmin;
      if (m.requiresRegister) return canRegisterUsers(profile);
      if (m.requiresManage) return roleMeta.canManageTeam;
      return true;
    }),
  ];

  nav.innerHTML = items
    .map(
      (item, i) => `
      <div class="nav-link-tm ${i === 0 ? 'active' : ''}" ${item.external ? `data-href="${item.id}"` : `data-nav="${item.id}"`}>
        <i class="${item.icon}"></i>
        <span>${item.label}</span>
      </div>`
    )
    .join('');
}

function renderModuleSections(profile) {
  const root = document.getElementById('module-sections-root');
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const renderers = {
    'page-tasks': renderTasksSection,
    'page-employees': renderEmployeesSection,
    'page-interns': renderInternsSection,
    'page-attendance': renderAttendanceSection,
    'page-leave': renderLeaveSection,
    'page-reports': renderReportsSection,
    'page-wall': renderWallSection,
    'page-chat': renderChatSection,
    'page-meetings': renderMeetingsSection,
    'page-admin': renderAdminSection,
    'page-settings': renderSettingsSection,
  };

  root.innerHTML = MODULES.filter((m) => !m.external)
    .map((m) => {
      const allowed = m.requiresAdmin ? roleMeta.isAdmin : m.requiresManage ? roleMeta.canManageTeam : true;
      if (!allowed) {
        return `<section class="page-section" id="${m.id}">
          <div class="coming-soon glass-card">
            <div class="icon-badge"><i class="fa-solid fa-lock"></i></div>
            <h3>Restricted</h3>
            <p class="mt-2">You don't have access to this section.</p>
          </div>
        </section>`;
      }
      const renderer = renderers[m.id];
      const body = typeof renderer === 'function' ? renderer() : `
        <div class="coming-soon glass-card">
          <div class="icon-badge"><i class="${m.icon}"></i></div>
          <h3>${m.label} module</h3>
          <p class="mt-2">This module is ready to connect to your Supabase table next.</p>
        </div>`;
      return `<section class="page-section" id="${m.id}">${body}</section>`;
    })
    .join('');
}

function wireNavigation() {
  document.body.addEventListener('click', (e) => {
    const external = e.target.closest('[data-href]');
    if (external) {
      e.preventDefault();
      window.location.href = external.dataset.href;
      return;
    }

    const target = e.target.closest('[data-nav]');
    if (!target) return;
    e.preventDefault();
    navigateTo(target.dataset.nav);
  });
}

function navigateTo(pageId) {
  document.querySelectorAll('.page-section').forEach((s) => s.classList.remove('active'));
  const section = document.getElementById(pageId);
  if (section) section.classList.add('active');

  document.querySelectorAll('.nav-link-tm').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === pageId);
  });

  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wireSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
  });
  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  });
}

function wireLogout() {
  document.getElementById('logout-btn').addEventListener('click', signOutUser);
}

function setCompletionRing(percent) {
  const circumference = 2 * Math.PI * 64;
  const offset = circumference - (percent / 100) * circumference;
  const ring = document.getElementById('completion-ring');
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference}`;
  requestAnimationFrame(() => {
    ring.style.strokeDashoffset = `${offset}`;
  });
  document.getElementById('completion-pct').textContent = percent > 0 ? `${percent}%` : '-';
}
