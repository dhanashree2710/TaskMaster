// ===========================================
// Admin Panel module (Super Admin / Admin only)
// ===========================================
let ADMIN_USERS = [];
let HOLIDAYS_CACHE = [];

function renderAdminSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Control room</span>
        <h2>Admin Panel</h2>
        <p>Manage accounts, departments, holidays, and audit activity.</p>
      </div>
    </div>

    <div class="tm-tabs">
      <div class="tm-tab active" data-admin-tab="users">Users</div>
      <div class="tm-tab" data-admin-tab="departments">Departments</div>
      <div class="tm-tab" data-admin-tab="holidays">Holidays</div>
      <div class="tm-tab" data-admin-tab="activity">Activity log</div>
    </div>

    <div class="tm-tab-panel active" id="admin-panel-users">
      <div class="filter-bar">
        <input type="text" class="form-control-tm search" id="admin-user-search" placeholder="Search people..." />
        <select class="form-select-tm" id="admin-user-role">
          <option value="">All roles</option>
          <option>Super Admin</option><option>Admin</option><option>Manager</option><option>Employee</option><option>Intern</option>
        </select>
        <span class="filter-count" id="admin-user-count"></span>
      </div>
      <div class="tm-table-wrap">
        <table class="tm-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
          <tbody id="admin-user-body"></tbody>
        </table>
      </div>
    </div>

    <div class="tm-tab-panel" id="admin-panel-departments">
      <div class="d-flex gap-2 mb-3">
        <input type="text" class="form-control-glass" style="padding-left:1rem;max-width:260px;" id="dept-name-input" placeholder="Department name" />
        <button class="btn-sm-gradient" id="dept-add-btn">Add department</button>
      </div>
      <div class="tm-table-wrap">
        <table class="tm-table"><thead><tr><th>Department</th><th>Head</th><th>Status</th><th></th></tr></thead><tbody id="dept-body"></tbody></table>
      </div>
    </div>

    <div class="tm-tab-panel" id="admin-panel-holidays">
      <div class="d-flex gap-2 mb-3 flex-wrap">
        <input type="text" class="form-control-glass" style="padding-left:1rem;max-width:220px;" id="holiday-title-input" placeholder="Holiday name" />
        <input type="date" class="form-control-glass" style="padding-left:1rem;max-width:180px;" id="holiday-date-input" />
        <button class="btn-sm-gradient" id="holiday-add-btn">Add holiday</button>
      </div>
      <div class="tm-table-wrap">
        <table class="tm-table"><thead><tr><th>Holiday</th><th>Date</th><th></th></tr></thead><tbody id="holiday-body"></tbody></table>
      </div>
    </div>

    <div class="tm-tab-panel" id="admin-panel-activity">
      <div class="tm-table-wrap">
        <table class="tm-table"><thead><tr><th>When</th><th>Who</th><th>Activity</th></tr></thead><tbody id="activity-body"></tbody></table>
      </div>
    </div>
  `;
}

async function initAdmin(profile) {
  document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-tab]').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tm-tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`admin-panel-${tab.dataset.adminTab}`).classList.add('active');
    });
  });

  document.getElementById('admin-user-search').addEventListener('input', renderAdminUsers);
  document.getElementById('admin-user-role').addEventListener('change', renderAdminUsers);
  document.getElementById('dept-add-btn').addEventListener('click', () => addDepartment(profile));
  document.getElementById('holiday-add-btn').addEventListener('click', () => addHoliday(profile));

  await loadAdminUsers();
  await loadDepartmentsAdmin();
  await loadHolidays();
  await loadActivityLog();
}

async function loadAdminUsers() {
  ADMIN_USERS = await fetchAllUsers();
  renderAdminUsers();
}

function renderAdminUsers() {
  const search = (document.getElementById('admin-user-search')?.value || '').toLowerCase();
  const role = document.getElementById('admin-user-role')?.value || '';
  const rows = ADMIN_USERS.filter((u) => {
    if (search && !(u.user_name.toLowerCase().includes(search) || u.user_email.toLowerCase().includes(search))) return false;
    if (role && u.role !== role) return false;
    return true;
  });
  document.getElementById('admin-user-count').textContent = `${rows.length} people`;
  const body = document.getElementById('admin-user-body');
  body.innerHTML = rows
    .map(
      (u) => `
    <tr>
      <td><div class="person-cell"><div class="avatar">${getInitials(u.user_name)}</div><div class="p-name">${escapeHtml(u.user_name)}</div></div></td>
      <td>${escapeHtml(u.user_email)}</td>
      <td>
        <select class="form-select-tm" data-role-select="${u.user_id}" style="min-width:120px;">
          ${['Super Admin', 'Admin', 'Manager', 'Employee', 'Intern'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </td>
      <td><span class="badge-soft ${statusBadgeClass(u.status)}">${escapeHtml(u.status)}</span></td>
      <td>${u.last_login ? fmtTimeAgo(u.last_login) : 'Never'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn-sm" data-toggle-status="${u.user_id}" title="Toggle active/inactive"><i class="fa-solid fa-power-off"></i></button>
        </div>
      </td>
    </tr>`
    )
    .join('');

  body.querySelectorAll('[data-role-select]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      const { error } = await sb.from('users').update({ role: sel.value }).eq('user_id', sel.dataset.roleSelect);
      if (error) return showToast(error.message, 'error');
      showToast('Role updated.', 'success');
      const profile = getStoredUser();
      await logActivity(profile.user_id, `Changed role for a user to ${sel.value}`);
      loadAdminUsers();
    })
  );
  body.querySelectorAll('[data-toggle-status]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const u = ADMIN_USERS.find((x) => x.user_id === btn.dataset.toggleStatus);
      const next = u.status === 'Active' ? 'Inactive' : 'Active';
      const { error } = await sb.from('users').update({ status: next }).eq('user_id', u.user_id);
      if (error) return showToast(error.message, 'error');
      showToast(`${u.user_name} is now ${next}.`, 'success');
      loadAdminUsers();
    })
  );
}

async function loadDepartmentsAdmin() {
  const departments = await fetchDepartments().catch(() => []);
  const body = document.getElementById('dept-body');
  body.innerHTML = departments.length
    ? departments
        .map(
          (d) => `
    <tr>
      <td>${escapeHtml(d.department_name)}</td>
      <td>-</td>
      <td><span class="badge-soft ${statusBadgeClass(d.status)}">${escapeHtml(d.status || 'Active')}</span></td>
      <td><button class="icon-btn-sm danger" data-dept-delete="${d.department_id}"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`
        )
        .join('')
    : `<tr class="tm-empty-row"><td colspan="4">No departments yet.</td></tr>`;

  body.querySelectorAll('[data-dept-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this department?')) return;
      await sb.from('departments').delete().eq('department_id', btn.dataset.deptDelete);
      loadDepartmentsAdmin();
    })
  );
}

async function addDepartment(profile) {
  const input = document.getElementById('dept-name-input');
  const name = input.value.trim();
  if (!name) return;
  const { error } = await sb.from('departments').insert({ department_name: name, status: 'Active' });
  if (error) return showToast(error.message, 'error');
  input.value = '';
  await logActivity(profile.user_id, `Created department ${name}`);
  loadDepartmentsAdmin();
}

async function loadHolidays() {
  const { data } = await sb.from('holidays').select('*').order('holiday_date');
  HOLIDAYS_CACHE = data || [];
  renderHolidays();
}

function renderHolidays() {
  const body = document.getElementById('holiday-body');
  body.innerHTML = HOLIDAYS_CACHE.length
    ? HOLIDAYS_CACHE.map(
        (h) => `
    <tr data-holiday-row="${h.holiday_id}">
      <td class="holiday-view-title">${escapeHtml(h.title)}</td>
      <td class="holiday-view-date">${fmtDate(h.holiday_date)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn-sm" data-holiday-edit="${h.holiday_id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn-sm danger" data-holiday-delete="${h.holiday_id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`
      ).join('')
    : `<tr class="tm-empty-row"><td colspan="3">No holidays added yet.</td></tr>`;

  body.querySelectorAll('[data-holiday-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this holiday?')) return;
      await sb.from('holidays').delete().eq('holiday_id', btn.dataset.holidayDelete);
      loadHolidays();
    })
  );
  body.querySelectorAll('[data-holiday-edit]').forEach((btn) =>
    btn.addEventListener('click', () => startHolidayEdit(btn.dataset.holidayEdit))
  );
}

function startHolidayEdit(holidayId) {
  const h = HOLIDAYS_CACHE.find((x) => x.holiday_id === holidayId);
  if (!h) return;
  const row = document.querySelector(`[data-holiday-row="${holidayId}"]`);
  row.innerHTML = `
    <td><input type="text" class="form-control-glass" style="padding-left:0.7rem;" id="he-title-${holidayId}" value="${escapeHtml(h.title)}" /></td>
    <td><input type="date" class="form-control-glass" style="padding-left:0.7rem;" id="he-date-${holidayId}" value="${h.holiday_date}" /></td>
    <td>
      <div class="row-actions">
        <button class="icon-btn-sm" data-holiday-save="${holidayId}" title="Save"><i class="fa-solid fa-check"></i></button>
        <button class="icon-btn-sm" data-holiday-cancel="${holidayId}" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </td>`;
  row.querySelector('[data-holiday-save]').addEventListener('click', () => saveHolidayEdit(holidayId));
  row.querySelector('[data-holiday-cancel]').addEventListener('click', renderHolidays);
}

async function saveHolidayEdit(holidayId) {
  const title = document.getElementById(`he-title-${holidayId}`).value.trim();
  const date = document.getElementById(`he-date-${holidayId}`).value;
  if (!title || !date) return showToast('Add a name and date.', 'error');
  const { error } = await sb.from('holidays').update({ title, holiday_date: date }).eq('holiday_id', holidayId);
  if (error) return showToast(error.message, 'error');
  showToast('Holiday updated.', 'success');
  loadHolidays();
}

async function addHoliday(profile) {
  const title = document.getElementById('holiday-title-input').value.trim();
  const date = document.getElementById('holiday-date-input').value;
  if (!title || !date) return showToast('Add a name and date.', 'error');
  const { error } = await sb.from('holidays').insert({ title, holiday_date: date });
  if (error) return showToast(error.message, 'error');
  document.getElementById('holiday-title-input').value = '';
  document.getElementById('holiday-date-input').value = '';
  await notifyManagers('New holiday added', `${title} on ${fmtDate(date)}`, 'page-admin');
  loadHolidays();
}

async function loadActivityLog() {
  const { data } = await sb.from('activity_logs').select('*, person:users(user_name)').order('created_at', { ascending: false }).limit(100);
  const body = document.getElementById('activity-body');
  body.innerHTML = (data || []).length
    ? data.map((a) => `<tr><td>${fmtTimeAgo(a.created_at)}</td><td>${escapeHtml(a.person?.user_name || 'System')}</td><td>${escapeHtml(a.activity)}</td></tr>`).join('')
    : `<tr class="tm-empty-row"><td colspan="3">No activity recorded yet.</td></tr>`;
}
