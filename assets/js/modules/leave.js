// ===========================================
// Leave module
// ===========================================
let LEAVE_CACHE = [];

function renderLeaveSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Time off</span>
        <h2>Leave</h2>
        <p>Apply for leave and track approvals in one place.</p>
      </div>
      <button class="btn-gradient" id="leave-new-btn"><i class="fa-solid fa-plus"></i> Apply for leave</button>
    </div>

    <div class="filter-bar">
      <select class="form-select-tm" id="leave-filter-status"><option value="">All status</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
      <select class="form-select-tm" id="leave-filter-type"><option value="">All types</option><option>Sick Leave</option><option>Casual Leave</option><option>Earned Leave</option><option>Unpaid Leave</option></select>
      <select class="form-select-tm" id="leave-filter-user" style="display:none;"><option value="">Everyone</option></select>
      <span class="filter-count" id="leave-filter-count"></span>
    </div>

    <div class="tm-table-wrap">
      <table class="tm-table">
        <thead><tr><th>Person</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th></th></tr></thead>
        <tbody id="leave-table-body"></tbody>
      </table>
    </div>
  `;
}

async function initLeave(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  document.getElementById('leave-new-btn').addEventListener('click', () => openLeaveModal(profile));
  ['leave-filter-status', 'leave-filter-type', 'leave-filter-user'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderLeaveTable);
  });

  if (canManage) {
    const users = await fetchActiveUsers();
    const sel = document.getElementById('leave-filter-user');
    sel.style.display = '';
    sel.innerHTML = '<option value="">Everyone</option>' + users.map((u) => `<option value="${u.user_id}">${escapeHtml(u.user_name)}</option>`).join('');
  }

  await loadLeave(profile, canManage);
}

async function loadLeave(profile, canManage) {
  let query = sb.from('leave_applications').select('*, person:users!leave_applications_user_id_fkey(user_name)').order('created_at', { ascending: false });
  if (!canManage) query = query.eq('user_id', profile.user_id);
  const { data, error } = await query;
  if (error) {
    console.error(error);
    return;
  }
  LEAVE_CACHE = data || [];
  renderLeaveTable();
}

function renderLeaveTable() {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  const status = document.getElementById('leave-filter-status')?.value;
  const type = document.getElementById('leave-filter-type')?.value;
  const user = document.getElementById('leave-filter-user')?.value;

  const rows = LEAVE_CACHE.filter((l) => {
    if (status && l.status !== status) return false;
    if (type && l.leave_type !== type) return false;
    if (user && l.user_id !== user) return false;
    return true;
  });

  document.getElementById('leave-filter-count').textContent = `${rows.length} request${rows.length === 1 ? '' : 's'}`;
  const body = document.getElementById('leave-table-body');
  if (!rows.length) {
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="7">No leave requests match these filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (l) => `
    <tr>
      <td>${escapeHtml(l.person?.user_name || '-')}</td>
      <td>${escapeHtml(l.leave_type || '-')}</td>
      <td>${fmtDate(l.from_date)}</td>
      <td>${fmtDate(l.to_date)}</td>
      <td>${l.days ?? '-'}</td>
      <td><span class="badge-soft ${statusBadgeClass(l.status)}">${escapeHtml(l.status)}</span></td>
      <td>
        ${canManage && l.status === 'Pending' ? `
        <div class="row-actions">
          <button class="icon-btn-sm" data-leave-approve="${l.leave_id}" title="Approve"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn-sm danger" data-leave-reject="${l.leave_id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>
        </div>` : ''}
      </td>
    </tr>`
    )
    .join('');

  body.querySelectorAll('[data-leave-approve]').forEach((btn) => btn.addEventListener('click', () => decideLeave(btn.dataset.leaveApprove, 'Approved')));
  body.querySelectorAll('[data-leave-reject]').forEach((btn) => btn.addEventListener('click', () => decideLeave(btn.dataset.leaveReject, 'Rejected')));
}

async function decideLeave(leaveId, decision) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const l = LEAVE_CACHE.find((x) => x.leave_id === leaveId);
  const { error } = await sb.from('leave_applications').update({ status: decision, approved_by: profile.user_id }).eq('leave_id', leaveId);
  if (error) return showToast(error.message, 'error');
  if (l) await notifyUsers([l.user_id], `Leave ${decision.toLowerCase()}`, `Your ${l.leave_type} request was ${decision.toLowerCase()}.`, 'page-leave');
  showToast(`Leave ${decision.toLowerCase()}.`, 'success');
  loadLeave(profile, roleMeta.canManageTeam);
}

function openLeaveModal(profile) {
  const html = `
    <div class="tm-modal-backdrop show" id="modal-leave-new">
      <div class="tm-modal">
        <div class="tm-modal-head"><h3>Apply for leave</h3><button class="tm-modal-close" data-close-modal="modal-leave-new">&times;</button></div>
        <div class="field"><label>Leave type</label>
          <select class="form-control-glass" id="lv-type">
            <option>Sick Leave</option><option>Casual Leave</option><option>Earned Leave</option><option>Unpaid Leave</option>
          </select>
        </div>
        <div class="field-row">
          <div class="field"><label>From</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="lv-from" /></div>
          <div class="field"><label>To</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="lv-to" /></div>
        </div>
        <div class="field"><label>Reason</label><textarea class="form-control-glass" id="lv-reason" placeholder="Let your manager know why"></textarea></div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-leave-new">Cancel</button>
          <button class="btn-sm-gradient" id="lv-submit">Submit request</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  document.getElementById('lv-submit').addEventListener('click', async () => {
    const from = document.getElementById('lv-from').value;
    const to = document.getElementById('lv-to').value;
    const leave_type = document.getElementById('lv-type').value;
    const reason = document.getElementById('lv-reason').value.trim();
    if (!from || !to) return showToast('Pick a date range.', 'error');
    const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);

    const { error } = await sb.from('leave_applications').insert({
      user_id: profile.user_id, leave_type, reason, from_date: from, to_date: to, days, status: 'Pending',
    });
    if (error) return showToast(error.message, 'error');

    await notifyManagers('Leave request', `${profile.user_name} applied for ${leave_type} (${days} day${days === 1 ? '' : 's'}).`, 'page-leave');
    await logActivity(profile.user_id, `Applied for ${leave_type}`);
    showToast('Leave request submitted.', 'success');
    closeModal('modal-leave-new');
    const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
    loadLeave(profile, roleMeta.canManageTeam);
  });
}
