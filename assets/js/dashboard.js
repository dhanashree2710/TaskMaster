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
  const today = officeTodayStr ? officeTodayStr() : new Date().toISOString().slice(0, 10);

  try {
    let taskQuery = sb.from('tasks').select('status, assigned_to, due_date, progress');
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

  try {
    let actQuery = sb
      .from('activity_logs')
      .select('log_id, activity, created_at, actor:users!activity_logs_user_id_fkey(user_name)')
      .order('created_at', { ascending: false })
      .limit(8);
    if (!canManage) actQuery = actQuery.eq('user_id', profile.user_id);
    const { data: activity, error } = await actQuery;
    if (error) {
      // fallback without embed
      const { data: plain } = await sb.from('activity_logs').select('log_id, activity, created_at, user_id').order('created_at', { ascending: false }).limit(8);
      renderRecentActivity((plain || []).map((r) => ({ ...r, actor: { user_name: '—' } })));
    } else {
      renderRecentActivity(activity || []);
    }
  } catch (e) {
    console.error('Could not load recent activity', e);
  }

  // Admin / Manager: full employee performance board (IT-style progress tracking)
  if (canManage) {
    await loadEmployeePerformanceBoard(profile, today);
  }
}

async function loadEmployeePerformanceBoard(profile, today) {
  // Inject container once
  let board = document.getElementById('perf-board');
  if (!board) {
    const dash = document.getElementById('page-dashboard');
    if (!dash) return;
    const wrap = document.createElement('div');
    wrap.id = 'perf-board';
    wrap.className = 'mt-4';
    wrap.innerHTML = `
      <div class="module-head" style="margin-bottom:0.75rem;">
        <div>
          <span class="section-kicker">People & growth</span>
          <h3 class="mb-0">Employee performance</h3>
          <p class="text-secondary mb-0" style="font-size:0.85rem;">Track tasks, targets, attendance and daily reports — the view managers use for increments and growth.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <input type="text" class="form-control-tm search" id="perf-search" placeholder="Search by name…" style="min-width:160px;" />
          <select class="form-select-tm" id="perf-role" style="width:auto;">
            <option value="">All roles</option>
            <option value="Employee">Employee</option>
            <option value="Intern">Intern</option>
            <option value="Manager">Manager</option>
          </select>
          <select class="form-select-tm" id="perf-range" style="width:auto;">
            <option value="7">Last 7 days</option>
            <option value="30" selected>Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>
      <div class="bento-grid mb-3" id="perf-summary-cards"></div>
      <div class="filter-bar mb-2" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
        <span class="filter-count" id="perf-filter-count"></span>
      </div>
      <div class="tm-table-wrap">
        <table class="tm-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Tasks</th>
              <th>Done</th>
              <th>Pending</th>
              <th>Overdue</th>
              <th>Progress</th>
              <th>Report</th>
              <th>Attendance</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="perf-table-body"><tr><td colspan="10">Loading…</td></tr></tbody>
        </table>
      </div>`;
    // Insert before Recent activity heading or at end of section
    const activityH = Array.from(dash.querySelectorAll('h3')).find((h) => h.textContent.includes('Recent activity'));
    if (activityH) dash.insertBefore(wrap, activityH);
    else dash.appendChild(wrap);
    board = wrap;
    const reload = () => loadEmployeePerformanceBoard(profile, today);
    document.getElementById('perf-range').addEventListener('change', reload);
    document.getElementById('perf-role').addEventListener('change', reload);
    // Debounced name search
    let searchTimer;
    document.getElementById('perf-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(reload, 250);
    });
  }

  const days = Number(document.getElementById('perf-range')?.value || 30);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  try {
    const [{ data: users }, { data: tasks }, { data: reports }, { data: attendance }] = await Promise.all([
      sb.from('users').select('user_id, user_name, role, status').eq('status', 'Active').in('role', ['Employee', 'Intern', 'Manager']),
      sb.from('tasks').select('task_id, assigned_to, status, progress, due_date, completed_date'),
      sb.from('daily_reports').select('user_id, report_date, status').gte('report_date', fromStr),
      sb.from('attendance').select('user_id, attendance_date, status, check_in, check_out').eq('attendance_date', today),
    ]);

    const roleFilter = (document.getElementById('perf-role')?.value || '').trim();
    const nameFilter = (document.getElementById('perf-search')?.value || '').trim().toLowerCase();

    let people = (users || []).filter((u) => u.role !== 'Super Admin' && u.role !== 'Admin');
    if (roleFilter) people = people.filter((u) => u.role === roleFilter);
    if (nameFilter) people = people.filter((u) => (u.user_name || '').toLowerCase().includes(nameFilter));

    const attMap = {};
    (attendance || []).forEach((a) => { attMap[a.user_id] = a; });
    const reportToday = {};
    (reports || []).filter((r) => r.report_date === today).forEach((r) => { reportToday[r.user_id] = r; });
    const reportCount = {};
    (reports || []).forEach((r) => {
      reportCount[r.user_id] = (reportCount[r.user_id] || 0) + 1;
    });

    // Summary cards (based on filtered people for role/name context)
    const present = people.filter((u) => {
      const a = attMap[u.user_id];
      return a && ['Present', 'Late'].includes(a.status);
    }).length;
    const notIn = people.length - present;
    const submittedToday = people.filter((u) => {
      const s = reportToday[u.user_id]?.status;
      return reportToday[u.user_id] && (!s || s === 'Submitted' || s === 'Reviewed');
    }).length;
    const filteredUserIds = new Set(people.map((u) => u.user_id));
    const overdueTasks = (tasks || []).filter((t) => filteredUserIds.has(t.assigned_to) && t.status !== 'Completed' && t.due_date && t.due_date < today).length;
    const completedTasks = (tasks || []).filter((t) => filteredUserIds.has(t.assigned_to) && t.status === 'Completed').length;

    const cardsEl = document.getElementById('perf-summary-cards');
    if (cardsEl) {
      cardsEl.innerHTML = `
        <div class="glass-card glass-card--hover"><div class="stat-icon" style="background:var(--gradient-brand);"><i class="fa-solid fa-users"></i></div>
          <div class="stat-value">${people.length}</div><div class="stat-label">Team members</div></div>
        <div class="glass-card glass-card--hover"><div class="stat-icon" style="background:linear-gradient(135deg,#2fd889,#61f4de);"><i class="fa-solid fa-fingerprint"></i></div>
          <div class="stat-value">${present}</div><div class="stat-label">Currently working</div></div>
        <div class="glass-card glass-card--hover"><div class="stat-icon" style="background:linear-gradient(135deg,#ff6b6b,#ff8e53);"><i class="fa-solid fa-user-slash"></i></div>
          <div class="stat-value">${Math.max(0, notIn)}</div><div class="stat-label">Not checked in</div></div>
        <div class="glass-card glass-card--hover"><div class="stat-icon" style="background:linear-gradient(135deg,#6e78ff,#a78bfa);"><i class="fa-solid fa-file-circle-check"></i></div>
          <div class="stat-value">${submittedToday}/${people.length}</div><div class="stat-label">Reports today</div></div>
        <div class="glass-card glass-card--hover"><div class="stat-icon" style="background:linear-gradient(135deg,#ffb648,#ff7a59);"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="stat-value">${overdueTasks}</div><div class="stat-label">Overdue tasks</div></div>
        <div class="glass-card glass-card--hover"><div class="stat-icon" style="background:linear-gradient(135deg,#2fd889,#34d399);"><i class="fa-solid fa-circle-check"></i></div>
          <div class="stat-value">${completedTasks}</div><div class="stat-label">Tasks completed</div></div>`;
    }

    // Per-employee rows
    const rows = people.map((u) => {
      const myTasks = (tasks || []).filter((t) => t.assigned_to === u.user_id);
      const done = myTasks.filter((t) => t.status === 'Completed').length;
      const pending = myTasks.filter((t) => t.status !== 'Completed').length;
      const overdue = myTasks.filter((t) => t.status !== 'Completed' && t.due_date && t.due_date < today).length;
      const avgProgress = myTasks.length
        ? Math.round(myTasks.reduce((s, t) => s + (Number(t.progress) || (t.status === 'Completed' ? 100 : 0)), 0) / myTasks.length)
        : 0;
      const att = attMap[u.user_id];
      const attLabel = att
        ? (att.check_out ? 'Present (out)' : att.status === 'Late' ? 'Late' : 'Present')
        : 'Not in';
      const attClass = att ? (att.status === 'Late' ? 'warn' : 'success') : 'danger';
      const rep = reportToday[u.user_id];
      const repOk = rep && (!rep.status || rep.status === 'Submitted' || rep.status === 'Reviewed');
      const repLabel = repOk ? '✓' : (rep ? 'Draft' : '—');
      const repClass = repOk ? 'success' : (rep ? 'warn' : 'danger');

      return {
        u, done, pending, overdue, total: myTasks.length, avgProgress, attLabel, attClass, repLabel, repClass,
        reportsInRange: reportCount[u.user_id] || 0,
      };
    }).sort((a, b) => a.avgProgress - b.avgProgress); // weakest first for manager attention

    const countEl = document.getElementById('perf-filter-count');
    if (countEl) {
      countEl.textContent = `${rows.length} person${rows.length === 1 ? '' : 's'}${roleFilter || nameFilter ? ' (filtered)' : ''}`;
    }

    const body = document.getElementById('perf-table-body');
    if (!rows.length) {
      body.innerHTML = `<tr class="tm-empty-row"><td colspan="10">No people match the current name / role filters.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(
        (r) => `
      <tr data-perf-user="${r.u.user_id}" style="cursor:pointer;">
        <td><strong>${escapeHtml(r.u.user_name)}</strong></td>
        <td><span class="badge-soft info">${escapeHtml(r.u.role)}</span></td>
        <td>${r.total}</td>
        <td>${r.done}</td>
        <td>${r.pending}</td>
        <td>${r.overdue ? `<span class="badge-soft danger">${r.overdue}</span>` : '0'}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div style="flex:1;height:6px;background:var(--border-color);border-radius:99px;overflow:hidden;">
              <div style="width:${r.avgProgress}%;height:100%;background:var(--gradient-brand);"></div>
            </div>
            <span style="font-size:0.8rem;min-width:2.2rem;">${r.avgProgress}%</span>
          </div>
        </td>
        <td><span class="badge-soft ${r.repClass}">${r.repLabel}</span></td>
        <td><span class="badge-soft ${r.attClass}">${r.attLabel}</span></td>
        <td><button class="icon-btn-sm" data-perf-open="${r.u.user_id}" title="Full progress"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></td>
      </tr>`
      )
      .join('');

    body.querySelectorAll('[data-perf-open], tr[data-perf-user]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = el.dataset.perfOpen || el.dataset.perfUser;
        if (uid) openEmployeeProgressModal(uid, days);
      });
    });
  } catch (err) {
    console.error('Performance board failed', err);
    const body = document.getElementById('perf-table-body');
    if (body) body.innerHTML = `<tr><td colspan="10">Could not load performance data. ${escapeHtml(err.message || '')}</td></tr>`;
  }
}

async function openEmployeeProgressModal(userId, days = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const today = officeTodayStr ? officeTodayStr() : new Date().toISOString().slice(0, 10);

  const [{ data: user }, { data: tasks }, { data: reports }, { data: attendance }, { data: activity }] = await Promise.all([
    sb.from('users').select('user_id, user_name, role, user_email, last_login').eq('user_id', userId).maybeSingle(),
    sb.from('tasks').select('task_id, title, status, progress, priority, due_date, completed_date, description').eq('assigned_to', userId).order('due_date', { ascending: true }),
    sb.from('daily_reports').select('report_id, report_date, hours, completed_work, pending_work, challenge, tomorrow_plan, status, manager_remark').eq('user_id', userId).gte('report_date', fromStr).order('report_date', { ascending: false }),
    sb.from('attendance').select('attendance_date, check_in, check_out, working_hours, status').eq('user_id', userId).gte('attendance_date', fromStr).order('attendance_date', { ascending: false }).limit(40),
    sb.from('activity_logs').select('activity, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
  ]);

  if (!user) return showToast('User not found', 'error');

  const done = (tasks || []).filter((t) => t.status === 'Completed').length;
  const pending = (tasks || []).filter((t) => t.status !== 'Completed').length;
  const overdue = (tasks || []).filter((t) => t.status !== 'Completed' && t.due_date && t.due_date < today).length;
  const presentDays = (attendance || []).filter((a) => ['Present', 'Late', 'Half Day'].includes(a.status)).length;
  const reportsSubmitted = (reports || []).filter((r) => !r.status || r.status === 'Submitted' || r.status === 'Reviewed').length;

  const html = `
    <div class="tm-modal-backdrop show" id="modal-emp-progress">
      <div class="tm-modal wide" style="max-width:920px;">
        <div class="tm-modal-head">
          <div>
            <h3>${escapeHtml(user.user_name)} <span class="badge-soft info" style="font-size:0.75rem;vertical-align:middle;">${escapeHtml(user.role)}</span></h3>
            <p class="text-secondary mb-0" style="font-size:0.82rem;">${escapeHtml(user.user_email || '')} · Last login ${user.last_login ? fmtDateTime(user.last_login) : '—'}</p>
          </div>
          <button class="tm-modal-close" data-close-modal="modal-emp-progress">&times;</button>
        </div>

        <div class="bento-grid mb-3" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));">
          <div class="glass-card" style="padding:0.85rem;"><div class="stat-value" style="font-size:1.4rem;">${(tasks||[]).length}</div><div class="stat-label">Tasks</div></div>
          <div class="glass-card" style="padding:0.85rem;"><div class="stat-value" style="font-size:1.4rem;">${done}</div><div class="stat-label">Completed</div></div>
          <div class="glass-card" style="padding:0.85rem;"><div class="stat-value" style="font-size:1.4rem;">${pending}</div><div class="stat-label">Pending</div></div>
          <div class="glass-card" style="padding:0.85rem;"><div class="stat-value" style="font-size:1.4rem;color:${overdue?'var(--danger,#ef4444)':''};">${overdue}</div><div class="stat-label">Overdue</div></div>
          <div class="glass-card" style="padding:0.85rem;"><div class="stat-value" style="font-size:1.4rem;">${presentDays}</div><div class="stat-label">Days present</div></div>
          <div class="glass-card" style="padding:0.85rem;"><div class="stat-value" style="font-size:1.4rem;">${reportsSubmitted}</div><div class="stat-label">Reports (${days}d)</div></div>
        </div>

        <div class="tm-tabs mb-3">
          <div class="tm-tab active" data-prog-tab="tasks">Tasks</div>
          <div class="tm-tab" data-prog-tab="reports">Daily reports</div>
          <div class="tm-tab" data-prog-tab="attendance">Attendance</div>
          <div class="tm-tab" data-prog-tab="timeline">Activity timeline</div>
        </div>

        <div class="tm-tab-panel active" id="prog-panel-tasks">
          <div class="tm-table-wrap">
            <table class="tm-table">
              <thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Progress</th><th>Due</th></tr></thead>
              <tbody>
                ${(tasks || []).length
                  ? (tasks || [])
                      .map(
                        (t) => `<tr>
                      <td><strong>${escapeHtml(t.title)}</strong>${t.description ? `<div class="text-secondary" style="font-size:0.78rem;">${escapeHtml((t.description || '').slice(0, 80))}</div>` : ''}</td>
                      <td><span class="badge-soft">${escapeHtml(t.priority || '-')}</span></td>
                      <td><span class="badge-soft ${t.status === 'Completed' ? 'success' : t.status === 'Overdue' || (t.due_date && t.due_date < today && t.status !== 'Completed') ? 'danger' : 'info'}">${escapeHtml(t.status)}</span></td>
                      <td>${t.progress ?? 0}%</td>
                      <td>${t.due_date ? fmtDate(t.due_date) : '-'}</td>
                    </tr>`
                      )
                      .join('')
                  : '<tr class="tm-empty-row"><td colspan="5">No tasks assigned.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="tm-tab-panel" id="prog-panel-reports">
          ${(reports || []).length
            ? (reports || [])
                .map(
                  (r) => `
            <div class="glass-card mb-2" style="padding:1rem;">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <strong>${fmtDate(r.report_date)}</strong>
                <span class="badge-soft ${!r.status || r.status === 'Submitted' || r.status === 'Reviewed' ? 'success' : 'warn'}">${escapeHtml(r.status || 'Submitted')} · ${r.hours || 0}h</span>
              </div>
              <div style="font-size:0.85rem;"><strong>Completed:</strong> ${escapeHtml((r.completed_work || '—').slice(0, 200))}</div>
              <div style="font-size:0.85rem;"><strong>Pending:</strong> ${escapeHtml((r.pending_work || '—').slice(0, 200))}</div>
              ${r.challenge ? `<div style="font-size:0.85rem;"><strong>Challenges:</strong> ${escapeHtml(r.challenge.slice(0, 150))}</div>` : ''}
              ${r.manager_remark ? `<div class="text-secondary" style="font-size:0.82rem;margin-top:0.35rem;"><i class="fa-solid fa-comment"></i> ${escapeHtml(r.manager_remark)}</div>` : ''}
            </div>`
                )
                .join('')
            : '<p class="text-secondary">No daily reports in this period.</p>'}
        </div>

        <div class="tm-tab-panel" id="prog-panel-attendance">
          <div class="tm-table-wrap">
            <table class="tm-table">
              <thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Status</th></tr></thead>
              <tbody>
                ${(attendance || []).length
                  ? (attendance || [])
                      .map(
                        (a) => `<tr>
                      <td>${fmtDate(a.attendance_date)}</td>
                      <td>${a.check_in ? fmtDateTime(a.check_in) : '-'}</td>
                      <td>${a.check_out ? fmtDateTime(a.check_out) : '-'}</td>
                      <td>${a.working_hours != null ? a.working_hours + 'h' : '-'}</td>
                      <td><span class="badge-soft ${statusBadgeClass ? statusBadgeClass(a.status) : ''}">${escapeHtml(a.status || '-')}</span></td>
                    </tr>`
                      )
                      .join('')
                  : '<tr class="tm-empty-row"><td colspan="5">No attendance records.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="tm-tab-panel" id="prog-panel-timeline">
          <div class="glass-card mb-3" style="padding:1rem;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong style="font-size:0.9rem;">Performance over last ${days} days</strong>
              <span class="text-secondary" style="font-size:0.78rem;">Tasks completed · Reports · Hours</span>
            </div>
            <canvas id="prog-perf-chart" height="120"></canvas>
          </div>

          <div class="mb-2">
            <strong style="font-size:0.88rem;">Visual activity stream</strong>
            <p class="text-secondary mb-0" style="font-size:0.78rem;">How work unfolded — check-ins, task completions, reports.</p>
          </div>
          <div id="prog-visual-timeline" style="position:relative;padding-left:1.25rem;border-left:2px solid var(--border-color);">
            ${buildVisualTimeline(tasks || [], reports || [], attendance || [], activity || [], today)}
          </div>
        </div>

        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-emp-progress">Close</button>
        </div>
      </div>
    </div>`;

  document.getElementById('modal-root').innerHTML = html;

  document.querySelectorAll('#modal-emp-progress [data-prog-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#modal-emp-progress [data-prog-tab]').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('#modal-emp-progress .tm-tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`prog-panel-${tab.dataset.progTab}`)?.classList.add('active');
      if (tab.dataset.progTab === 'timeline') {
        renderEmployeePerfChart(userId, tasks || [], reports || [], attendance || [], days);
      }
    });
  });
}

/** Build a visual vertical timeline of key events for one employee */
function buildVisualTimeline(tasks, reports, attendance, activity, today) {
  const events = [];

  (attendance || []).forEach((a) => {
    if (a.check_in) {
      events.push({
        at: a.check_in,
        date: a.attendance_date,
        type: 'checkin',
        icon: 'fa-fingerprint',
        color: '#2fd889',
        label: `Checked in${a.status === 'Late' ? ' (Late)' : ''}`,
        detail: a.check_out ? `Out ${fmtDateTime(a.check_out)} · ${a.working_hours || '?'}h` : 'Still in',
      });
    }
  });

  (tasks || []).forEach((t) => {
    if (t.status === 'Completed' && t.completed_date) {
      events.push({
        at: t.completed_date + 'T12:00:00',
        date: t.completed_date,
        type: 'task',
        icon: 'fa-circle-check',
        color: '#6e78ff',
        label: `Completed: ${t.title}`,
        detail: t.priority ? `Priority ${t.priority}` : '',
      });
    }
  });

  (reports || []).forEach((r) => {
    events.push({
      at: r.report_date + 'T18:00:00',
      date: r.report_date,
      type: 'report',
      icon: 'fa-file-lines',
      color: '#a78bfa',
      label: `Daily report submitted`,
      detail: `${r.hours || 0}h logged${r.status ? ' · ' + r.status : ''}`,
    });
  });

  (activity || []).slice(0, 20).forEach((a) => {
    events.push({
      at: a.created_at,
      date: (a.created_at || '').slice(0, 10),
      type: 'activity',
      icon: 'fa-bolt',
      color: '#94a3b8',
      label: a.activity || 'Activity',
      detail: '',
    });
  });

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // newest first

  if (!events.length) {
    return '<p class="text-secondary" style="padding:0.5rem 0;">No timeline events in this period.</p>';
  }

  return events
    .slice(0, 40)
    .map(
      (e) => `
    <div style="position:relative;padding:0.65rem 0 0.65rem 1rem;">
      <span style="position:absolute;left:-1.55rem;top:0.85rem;width:12px;height:12px;border-radius:50%;background:${e.color};border:2px solid var(--bg-card, #1a1a2e);box-shadow:0 0 0 2px ${e.color}33;"></span>
      <div class="d-flex justify-content-between gap-2 flex-wrap">
        <div>
          <div style="font-size:0.88rem;"><i class="fa-solid ${e.icon}" style="color:${e.color};margin-right:0.35rem;"></i><strong>${escapeHtml(e.label)}</strong></div>
          ${e.detail ? `<div class="text-secondary" style="font-size:0.78rem;margin-top:0.15rem;">${escapeHtml(e.detail)}</div>` : ''}
        </div>
        <div class="text-secondary" style="font-size:0.76rem;white-space:nowrap;">${e.date ? fmtDate(e.date) : ''}${e.at && e.at.includes('T') && e.type !== 'task' && e.type !== 'report' ? ' · ' + fmtDateTime(e.at) : ''}</div>
      </div>
    </div>`
    )
    .join('');
}

/** Chart: daily task completions + reports + hours for one employee */
function renderEmployeePerfChart(userId, tasks, reports, attendance, days) {
  const canvas = document.getElementById('prog-perf-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Destroy previous instance if any
  if (canvas._chartInstance) {
    try { canvas._chartInstance.destroy(); } catch (_) {}
  }

  const labels = [];
  const taskDone = [];
  const reportFlag = [];
  const hours = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key.slice(5)); // MM-DD
    taskDone.push((tasks || []).filter((t) => t.status === 'Completed' && t.completed_date === key).length);
    const rep = (reports || []).find((r) => r.report_date === key);
    reportFlag.push(rep ? 1 : 0);
    const att = (attendance || []).find((a) => a.attendance_date === key);
    hours.push(att && att.working_hours != null ? Number(att.working_hours) : 0);
  }

  canvas._chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Tasks completed',
          data: taskDone,
          backgroundColor: 'rgba(110, 120, 255, 0.7)',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Hours worked',
          data: hours,
          borderColor: '#2fd889',
          backgroundColor: 'rgba(47, 216, 137, 0.15)',
          tension: 0.3,
          fill: true,
          yAxisID: 'y1',
          pointRadius: 2,
        },
        {
          type: 'bar',
          label: 'Report submitted',
          data: reportFlag,
          backgroundColor: 'rgba(167, 139, 250, 0.5)',
          borderRadius: 4,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 10 } },
          title: { display: true, text: 'Count', font: { size: 10 } },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 10 } },
          title: { display: true, text: 'Hours', font: { size: 10 } },
        },
        x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
      },
    },
  });
}

function renderRecentActivity(rows) {
  const card = document.getElementById('recent-activity-card');
  if (!card) return;
  if (!rows.length) {
    card.classList.add('activity-card');
    card.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i><p>Activity will show up here once tasks, attendance, and posts start flowing through Supabase.</p>`;
    return;
  }
  card.classList.remove('activity-card');
  card.innerHTML = rows
    .map(
      (row) => `
      <div class="d-flex align-items-start gap-2" style="padding:0.6rem 0;border-bottom:1px solid var(--border-color);">
        <i class="fa-solid fa-clock-rotate-left mt-1" style="color:var(--text-secondary);"></i>
        <div style="flex:1;">
          <div style="font-size:0.88rem;"><strong>${escapeHtml(row.actor?.user_name || 'Someone')}</strong> ${escapeHtml(row.activity || '')}</div>
          <div class="text-secondary" style="font-size:0.76rem;">${fmtTimeAgo(row.created_at)}</div>
        </div>
      </div>`
    )
    .join('');
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
