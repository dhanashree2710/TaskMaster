// ===========================================
// Employees module
// ===========================================
let EMP_CACHE = [];
let EMP_DEPTS = [];

function renderEmployeesSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">People</span>
        <h2>Employees</h2>
        <p>Every employee record, linked to their workspace login.</p>
      </div>
      <a class="btn-gradient" data-register-only href="register.html"><i class="fa-solid fa-user-plus"></i> Register employee</a>
    </div>

    <div class="filter-bar">
      <input type="text" class="form-control-tm search" id="emp-filter-search" placeholder="Search by name, code, email..." />
      <select class="form-select-tm" id="emp-filter-dept"><option value="">All departments</option></select>
      <select class="form-select-tm" id="emp-filter-status"><option value="">All status</option><option>Active</option><option>Inactive</option></select>
      <span class="filter-count" id="emp-filter-count"></span>
    </div>

    <div class="tm-table-wrap">
      <table class="tm-table">
        <thead><tr><th>Employee</th><th>Code</th><th>Department</th><th>Designation</th><th>Joined</th><th>Status</th><th></th></tr></thead>
        <tbody id="emp-table-body"></tbody>
      </table>
    </div>
  `;
}

async function initEmployees(profile) {
  EMP_DEPTS = await fetchDepartments().catch(() => []);
  const deptSel = document.getElementById('emp-filter-dept');
  deptSel.innerHTML =
    '<option value="">All departments</option>' +
    EMP_DEPTS.map((d) => `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`).join('');

  ['emp-filter-search', 'emp-filter-dept', 'emp-filter-status'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderEmployeeTable);
    document.getElementById(id).addEventListener('change', renderEmployeeTable);
  });

  await loadEmployees();
}

async function loadEmployees() {
  const { data, error } = await sb
    .from('employees')
    .select('*, department:departments(department_name), account:users!employees_user_id_fkey(role,status,user_email)')
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  EMP_CACHE = data || [];
  renderEmployeeTable();
}

function renderEmployeeTable() {
  const search = (document.getElementById('emp-filter-search')?.value || '').toLowerCase();
  const dept = document.getElementById('emp-filter-dept')?.value || '';
  const status = document.getElementById('emp-filter-status')?.value || '';

  const rows = EMP_CACHE.filter((e) => {
    const name = fullName(e).toLowerCase();
    if (search && !(name.includes(search) || (e.employee_code || '').toLowerCase().includes(search) || (e.email || '').toLowerCase().includes(search))) return false;
    if (dept && e.department_id !== dept) return false;
    if (status && e.status !== status) return false;
    return true;
  });

  document.getElementById('emp-filter-count').textContent = `${rows.length} employee${rows.length === 1 ? '' : 's'}`;
  const body = document.getElementById('emp-table-body');
  if (!rows.length) {
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="7">No employees match these filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (e) => `
    <tr>
      <td><div class="person-cell">${avatarHtml(fullName(e), e.photo_url)}<div><div class="p-name">${escapeHtml(fullName(e))}</div><div class="p-sub">${escapeHtml(e.email || e.account?.user_email || '')}</div></div></div></td>
      <td class="mono">${escapeHtml(e.employee_code || '-')}</td>
      <td>${escapeHtml(e.department?.department_name || '-')}</td>
      <td>${escapeHtml(e.designation || '-')}</td>
      <td>${fmtDate(e.joining_date)}</td>
      <td><span class="badge-soft ${statusBadgeClass(e.status)}">${escapeHtml(e.status)}</span></td>
      <td><button class="icon-btn-sm" data-emp-view="${e.employee_id}"><i class="fa-solid fa-eye"></i></button></td>
    </tr>`
    )
    .join('');
  body.querySelectorAll('[data-emp-view]').forEach((btn) => btn.addEventListener('click', () => openEmployeeDetail(btn.dataset.empView)));
}

async function openEmployeeDetail(id) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const e = EMP_CACHE.find((x) => x.employee_id === id);
  if (!e) return;
  const canEdit = roleMeta.canManageTeam;

  const html = `
    <div class="tm-modal-backdrop show" id="modal-emp-detail">
      <div class="tm-modal wide">
        <div class="tm-modal-head"><h3>${escapeHtml(fullName(e))}</h3><button class="tm-modal-close" data-close-modal="modal-emp-detail">&times;</button></div>
        <div class="detail-grid mb-3">
          <div><div class="dl-label">Employee code</div><div class="dl-value">${escapeHtml(e.employee_code || '-')}</div></div>
          <div><div class="dl-label">Email</div><div class="dl-value">${escapeHtml(e.email || '-')}</div></div>
          <div><div class="dl-label">Phone</div><div class="dl-value">${escapeHtml(e.phone || '-')}</div></div>
          <div><div class="dl-label">Joining date</div><div class="dl-value">${fmtDate(e.joining_date)}</div></div>
          <div><div class="dl-label">Login role</div><div class="dl-value">${escapeHtml(e.account?.role || '-')}</div></div>
          <div><div class="dl-label">Account status</div><div class="dl-value">${escapeHtml(e.account?.status || '-')}</div></div>
        </div>

        ${renderPhotoField('ed-photo', { label: 'Photo', url: e.photo_url || '' })}

        <div class="field-row">
          <div class="field"><label>Designation</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="ed-designation" value="${escapeHtml(e.designation || '')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="field"><label>Department</label>
            <select class="form-control-glass" id="ed-department" ${canEdit ? '' : 'disabled'}>
              <option value="">None</option>
              ${EMP_DEPTS.map((d) => `<option value="${d.department_id}" ${d.department_id === e.department_id ? 'selected' : ''}>${escapeHtml(d.department_name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Phone</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="ed-phone" value="${escapeHtml(e.phone || '')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="field"><label>Status</label>
            <select class="form-control-glass" id="ed-status" ${canEdit ? '' : 'disabled'}>
              <option ${e.status === 'Active' ? 'selected' : ''}>Active</option>
              <option ${e.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>

        ${canEdit ? `<div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-emp-detail">Close</button>
          <button class="btn-sm-gradient" id="ed-save">Save changes</button>
        </div>` : ''}
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  wirePhotoField('ed-photo', STORAGE_BUCKETS.employeePhotos);

  document.getElementById('ed-save')?.addEventListener('click', async () => {
    const patch = {
      designation: document.getElementById('ed-designation').value.trim(),
      department_id: document.getElementById('ed-department').value || null,
      phone: document.getElementById('ed-phone').value.trim(),
      status: document.getElementById('ed-status').value,
      photo_url: document.getElementById('ed-photo').value.trim() || null,
    };
    const { error } = await sb.from('employees').update(patch).eq('employee_id', id);
    if (error) return showToast(error.message, 'error');

    if (e.user_id) {
      await sb.from('users').update({ status: patch.status }).eq('user_id', e.user_id);
    }
    await logActivity(profile.user_id, `Updated employee ${fullName(e)}`);
    showToast('Employee updated.', 'success');
    closeModal('modal-emp-detail');
    loadEmployees();
  });
}
