// ===========================================
// Reports module (daily reports)
// ===========================================
let REP_CACHE = [];

function renderReportsSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Visibility</span>
        <h2>Reports</h2>
        <p>Daily work logs and task progress so managers always know where things stand.</p>
      </div>
      <button class="btn-gradient" id="rep-new-btn"><i class="fa-solid fa-plus"></i> Submit report</button>
    </div>

    <div class="tm-tabs">
      <div class="tm-tab active" data-rep-tab="daily">Daily Reports</div>
      <div class="tm-tab" data-rep-tab="tasks">Task Reports</div>
    </div>

    <div class="tm-tab-panel active" id="rep-panel-daily">
      <div class="filter-bar">
        <input type="date" class="form-control-tm" id="rep-filter-date" />
        <select class="form-select-tm" id="rep-filter-user" style="display:none;"><option value="">Everyone</option></select>
        <span class="filter-count" id="rep-filter-count"></span>
      </div>

      <div id="rep-list"></div>
    </div>

    <div class="tm-tab-panel" id="rep-panel-tasks">
      <div class="filter-bar">
        <select class="form-select-tm" id="rep-task-scope" style="display:none;"><option value="all">Employees &amp; interns</option><option value="Employee">Employees only</option><option value="Intern">Interns only</option></select>
        <span class="filter-count" id="rep-task-count"></span>
      </div>
      <div class="glass-card mb-3" style="padding:1.2rem;">
        <canvas id="rep-task-chart" height="110"></canvas>
      </div>
      <div id="rep-task-people"></div>
    </div>
  `;
}

async function initReports(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  document.getElementById('rep-new-btn').addEventListener('click', () => openReportModal(profile));
  document.getElementById('rep-filter-date').addEventListener('change', renderReportList);
  document.getElementById('rep-filter-user').addEventListener('change', renderReportList);

  document.querySelectorAll('[data-rep-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-rep-tab]').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('#page-reports .tm-tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`rep-panel-${tab.dataset.repTab}`).classList.add('active');
      if (tab.dataset.repTab === 'tasks') renderTaskReport(profile, canManage);
    });
  });

  if (canManage) {
    const users = await fetchActiveUsers();
    const sel = document.getElementById('rep-filter-user');
    sel.style.display = '';
    sel.innerHTML = '<option value="">Everyone</option>' + users.map((u) => `<option value="${u.user_id}">${escapeHtml(u.user_name)}</option>`).join('');

    const scopeSel = document.getElementById('rep-task-scope');
    scopeSel.style.display = '';
    scopeSel.addEventListener('change', () => renderTaskReport(profile, canManage));
  }

  await loadReports(profile, canManage);
}

// ---------- Task Reports: status breakdown per employee/intern, as a chart ----------
// Reuses TASKS_CACHE from the Tasks module (already loaded for every
// profile on dashboard init) so this stays in sync without a second fetch.
let REP_TASK_CHART = null;
const TASK_STATUS_ORDER = ['Pending', 'In Progress', 'Completed', 'Overdue'];
const TASK_STATUS_COLORS = { Pending: '#4fb0ff', 'In Progress': '#ffb648', Completed: '#2fd889', Overdue: '#ff5c72' };

function renderTaskReport(profile, canManage) {
  const scope = document.getElementById('rep-task-scope')?.value || 'all';
  const tasks = (typeof TASKS_CACHE !== 'undefined' ? TASKS_CACHE : []).filter((t) => {
    if (!canManage) return t.assigned_to === profile.user_id;
    if (scope === 'all') return true;
    return t.assignee?.role === scope;
  });

  // Group by assignee.
  const byPerson = new Map();
  tasks.forEach((t) => {
    const key = t.assigned_to || 'unassigned';
    if (!byPerson.has(key)) {
      byPerson.set(key, { name: t.assignee?.user_name || 'Unassigned', role: t.assignee?.role || '-', tasks: [] });
    }
    byPerson.get(key).tasks.push(t);
  });

  document.getElementById('rep-task-count').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} across ${byPerson.size} ${byPerson.size === 1 ? 'person' : 'people'}`;

  renderTaskReportChart(byPerson);
  renderTaskReportPeople(byPerson);
}

function renderTaskReportChart(byPerson) {
  const canvas = document.getElementById('rep-task-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const people = [...byPerson.values()];
  const labels = people.map((p) => p.name);
  const datasets = TASK_STATUS_ORDER.map((status) => ({
    label: status,
    data: people.map((p) => p.tasks.filter((t) => t.status === status).length),
    backgroundColor: TASK_STATUS_COLORS[status],
    borderRadius: 4,
  }));

  if (REP_TASK_CHART) REP_TASK_CHART.destroy();
  REP_TASK_CHART = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#888' } } },
      scales: {
        x: { stacked: true, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#888' }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#888' }, grid: { color: 'rgba(128,128,128,0.15)' } },
      },
    },
  });
}

function renderTaskReportPeople(byPerson) {
  const root = document.getElementById('rep-task-people');
  if (!byPerson.size) {
    root.innerHTML = `<div class="glass-card activity-card"><i class="fa-solid fa-chart-column"></i><p>No tasks to report on yet.</p></div>`;
    return;
  }

  root.innerHTML = [...byPerson.entries()]
    .map(([userId, p]) => {
      const counts = TASK_STATUS_ORDER.map((s) => ({ status: s, n: p.tasks.filter((t) => t.status === s).length }));
      return `
      <div class="glass-card mb-3">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <div><strong>${escapeHtml(p.name)}</strong> <span class="badge-soft info" style="margin-left:0.4rem;">${escapeHtml(p.role)}</span></div>
          <div class="d-flex gap-2 flex-wrap">
            ${counts.map((c) => `<span class="badge-soft ${statusBadgeClass(c.status)}">${c.status}: ${c.n}</span>`).join('')}
          </div>
        </div>
        <div class="tm-table-wrap">
          <table class="tm-table">
            <thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Progress</th></tr></thead>
            <tbody>
              ${p.tasks
                .map(
                  (t) => `
                <tr class="rep-task-row" data-rep-task="${t.task_id}" style="cursor:pointer;">
                  <td>${escapeHtml(t.title)}</td>
                  <td><span class="badge-soft ${priorityBadge(t.priority)}">${escapeHtml(t.priority || '-')}</span></td>
                  <td><span class="badge-soft ${statusBadgeClass(t.status)}">${escapeHtml(t.status)}</span></td>
                  <td>${fmtDate(t.due_date)}</td>
                  <td><div class="mini-progress"><span style="width:${t.progress || 0}%;"></span></div></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    })
    .join('');

  root.querySelectorAll('[data-rep-task]').forEach((row) =>
    row.addEventListener('click', () => openTaskDetail(row.dataset.repTask))
  );
}

async function loadReports(profile, canManage) {
  let query = sb.from('daily_reports').select('*, person:users(user_name)').order('report_date', { ascending: false }).limit(200);
  if (!canManage) query = query.eq('user_id', profile.user_id);
  const { data, error } = await query;
  if (error) {
    console.error(error);
    return;
  }
  REP_CACHE = data || [];
  renderReportList();
}

function renderReportList() {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  const date = document.getElementById('rep-filter-date')?.value;
  const user = document.getElementById('rep-filter-user')?.value;

  const rows = REP_CACHE.filter((r) => {
    if (date && r.report_date !== date) return false;
    if (user && r.user_id !== user) return false;
    return true;
  });

  document.getElementById('rep-filter-count').textContent = `${rows.length} report${rows.length === 1 ? '' : 's'}`;
  const list = document.getElementById('rep-list');
  if (!rows.length) {
    list.innerHTML = `<div class="glass-card activity-card"><i class="fa-solid fa-file-lines"></i><p>No daily reports match these filters.</p></div>`;
    return;
  }

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="glass-card mb-3">
      <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
        <div><strong>${escapeHtml(r.person?.user_name || 'Someone')}</strong> <span class="text-secondary" style="font-size:0.8rem;"> &middot; ${fmtDate(r.report_date)} &middot; ${r.hours || 0}h logged</span></div>
      </div>
      <div class="detail-grid mb-2">
        <div><div class="dl-label">Completed</div><div class="dl-value" style="font-weight:400;">${escapeHtml(r.completed_work || '-')}</div></div>
        <div><div class="dl-label">Pending</div><div class="dl-value" style="font-weight:400;">${escapeHtml(r.pending_work || '-')}</div></div>
        <div><div class="dl-label">Challenges</div><div class="dl-value" style="font-weight:400;">${escapeHtml(r.challenge || '-')}</div></div>
        <div><div class="dl-label">Tomorrow's plan</div><div class="dl-value" style="font-weight:400;">${escapeHtml(r.tomorrow_plan || '-')}</div></div>
      </div>
      ${r.manager_remark ? `<div class="badge-soft info">Manager remark: ${escapeHtml(r.manager_remark)}</div>` : ''}
      ${canManage ? `<div class="d-flex gap-2 mt-2">
        <input type="text" class="form-control-glass" style="padding-left:1rem;" placeholder="Add a remark" id="remark-${r.report_id}" value="${escapeHtml(r.manager_remark || '')}" />
        <button class="btn-sm-ghost" data-remark-save="${r.report_id}">Save</button>
      </div>` : ''}
    </div>`
    )
    .join('');

  list.querySelectorAll('[data-remark-save]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.remarkSave;
      const value = document.getElementById(`remark-${id}`).value.trim();
      const { error } = await sb.from('daily_reports').update({ manager_remark: value }).eq('report_id', id);
      if (error) return showToast(error.message, 'error');
      showToast('Remark saved.', 'success');
      loadReports(profile, canManage);
    })
  );
}

function openReportModal(profile) {
  const today = new Date().toISOString().slice(0, 10);
  const html = `
    <div class="tm-modal-backdrop show" id="modal-report-new">
      <div class="tm-modal wide">
        <div class="tm-modal-head"><h3>Submit daily report</h3><button class="tm-modal-close" data-close-modal="modal-report-new">&times;</button></div>
        <div class="field-row">
          <div class="field"><label>Date</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="rp-date" value="${today}" /></div>
          <div class="field"><label>Hours worked</label><input type="number" min="0" max="24" step="0.5" class="form-control-glass" style="padding-left:1rem;" id="rp-hours" value="8" /></div>
        </div>
        <div class="field"><label>Completed work</label><textarea class="form-control-glass" id="rp-completed"></textarea></div>
        <div class="field"><label>Pending work</label><textarea class="form-control-glass" id="rp-pending"></textarea></div>
        <div class="field-row">
          <div class="field"><label>Challenges</label><textarea class="form-control-glass" id="rp-challenge"></textarea></div>
          <div class="field"><label>Tomorrow's plan</label><textarea class="form-control-glass" id="rp-tomorrow"></textarea></div>
        </div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-report-new">Cancel</button>
          <button class="btn-sm-gradient" id="rp-submit">Submit</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  document.getElementById('rp-submit').addEventListener('click', async () => {
    const payload = {
      user_id: profile.user_id,
      report_date: document.getElementById('rp-date').value,
      hours: Number(document.getElementById('rp-hours').value) || 0,
      completed_work: document.getElementById('rp-completed').value.trim(),
      pending_work: document.getElementById('rp-pending').value.trim(),
      challenge: document.getElementById('rp-challenge').value.trim(),
      tomorrow_plan: document.getElementById('rp-tomorrow').value.trim(),
    };
    const { error } = await sb.from('daily_reports').insert(payload);
    if (error) return showToast(error.message, 'error');
    await logActivity(profile.user_id, 'Submitted a daily report');
    showToast('Report submitted.', 'success');
    closeModal('modal-report-new');
    const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
    loadReports(profile, roleMeta.canManageTeam);
  });
}
