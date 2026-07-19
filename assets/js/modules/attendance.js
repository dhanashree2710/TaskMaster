// ===========================================
// Attendance module
// ===========================================
let ATT_CACHE = [];
let ATT_TODAY = null;
let ATT_TAB = 'all';

// Office hours: 10:30 AM - 5:30 PM (Asia/Kolkata). Checking in any time
// after 10:30 AM counts as Late.
const OFFICE_START_HOUR = 10;
const OFFICE_START_MINUTE = 30;

function renderAttendanceSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Presence</span>
        <h2>Attendance</h2>
        <p>Check in, check out, and review presence across the team.</p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn-sm-ghost" id="att-add-record-btn" style="display:none;"><i class="fa-solid fa-plus"></i> Add record</button>
        <button class="btn-gradient" id="att-checkin-btn"><i class="fa-solid fa-fingerprint"></i> Check in</button>
        <button class="btn-sm-ghost" id="att-checkout-btn" style="display:none;">Check out</button>
      </div>
    </div>

    <div class="tm-tabs">
      <div class="tm-tab active" data-att-view="daily">Daily log</div>
      <div class="tm-tab" data-att-view="monthly">Monthly summary</div>
    </div>

    <div class="tm-tabs" id="att-tabs" style="display:none;">
      <div class="tm-tab active" data-att-tab="all">Everyone</div>
      <div class="tm-tab" data-att-tab="Employee">Employees</div>
      <div class="tm-tab" data-att-tab="Intern">Interns</div>
    </div>

    <div class="tm-tab-panel active" id="att-panel-daily">
      <div class="filter-bar">
        <input type="date" class="form-control-tm" id="att-filter-from" />
        <input type="date" class="form-control-tm" id="att-filter-to" />
        <select class="form-select-tm" id="att-filter-status"><option value="">All status</option><option>Present</option><option>Absent</option><option>Half Day</option><option>Late</option></select>
        <select class="form-select-tm" id="att-filter-user" style="display:none;"><option value="">Everyone</option></select>
        <span class="filter-count" id="att-filter-count"></span>
      </div>

      <div class="tm-table-wrap">
        <table class="tm-table">
          <thead><tr><th>Date</th><th>Person</th><th>Type</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Status</th><th id="att-th-actions" style="display:none;"></th></tr></thead>
          <tbody id="att-table-body"></tbody>
        </table>
      </div>
    </div>

    <div class="tm-tab-panel" id="att-panel-monthly">
      <div class="filter-bar">
        <input type="month" class="form-control-tm" id="att-month-input" />
        <span class="filter-count" id="att-month-count"></span>
      </div>
      <div class="tm-table-wrap">
        <table class="tm-table">
          <thead><tr><th>Person</th><th>Type</th><th>Present</th><th>Late</th><th>Half Day</th><th>Absent</th><th>Total hours</th></tr></thead>
          <tbody id="att-month-body"></tbody>
        </table>
      </div>
    </div>
  `;
}

async function initAttendance(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  document.getElementById('att-checkin-btn').addEventListener('click', () => checkIn(profile));
  document.getElementById('att-checkout-btn').addEventListener('click', () => checkOut(profile));

  ['att-filter-from', 'att-filter-to', 'att-filter-status', 'att-filter-user'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderAttendanceTable);
    document.getElementById(id).addEventListener('change', renderAttendanceTable);
  });

  document.querySelectorAll('[data-att-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-att-view]').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('#page-attendance .tm-tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`att-panel-${tab.dataset.attView}`).classList.add('active');
      document.getElementById('att-tabs').style.display = tab.dataset.attView === 'daily' && canManage ? '' : 'none';
      if (tab.dataset.attView === 'monthly') renderMonthlySummary(canManage);
    });
  });

  const monthInput = document.getElementById('att-month-input');
  monthInput.value = officeTodayStr().slice(0, 7);
  monthInput.addEventListener('change', () => renderMonthlySummary(canManage));

  if (canManage) {
    const users = await fetchActiveUsers();
    const sel = document.getElementById('att-filter-user');
    sel.style.display = '';
    sel.innerHTML = '<option value="">Everyone</option>' + users.map((u) => `<option value="${u.user_id}">${escapeHtml(u.user_name)} (${escapeHtml(u.role)})</option>`).join('');

    document.getElementById('att-tabs').style.display = '';
    document.querySelectorAll('[data-att-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-att-tab]').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        ATT_TAB = tab.dataset.attTab;
        renderAttendanceTable();
      });
    });

    document.getElementById('att-th-actions').style.display = '';

    const addBtn = document.getElementById('att-add-record-btn');
    addBtn.style.display = '';
    addBtn.addEventListener('click', () => openAttendanceAddModal(users));
  }

  await loadAttendance(profile, canManage);
}

async function loadAttendance(profile, canManage) {
  let query = sb.from('attendance').select('*, person:users(user_name, role)').order('attendance_date', { ascending: false }).limit(300);
  if (!canManage) query = query.eq('user_id', profile.user_id);
  const { data, error } = await query;
  if (error) {
    console.error(error);
    return;
  }
  ATT_CACHE = data || [];

  const today = officeTodayStr();
  ATT_TODAY = ATT_CACHE.find((a) => a.user_id === profile.user_id && a.attendance_date === today) || null;
  document.getElementById('att-checkin-btn').style.display = ATT_TODAY ? 'none' : '';
  document.getElementById('att-checkout-btn').style.display = ATT_TODAY && !ATT_TODAY.check_out ? '' : 'none';

  renderAttendanceTable();
}

function renderAttendanceTable() {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile?.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  const from = document.getElementById('att-filter-from')?.value;
  const to = document.getElementById('att-filter-to')?.value;
  const status = document.getElementById('att-filter-status')?.value;
  const user = document.getElementById('att-filter-user')?.value;

  const rows = ATT_CACHE.filter((a) => {
    if (from && a.attendance_date < from) return false;
    if (to && a.attendance_date > to) return false;
    if (status && a.status !== status) return false;
    if (user && a.user_id !== user) return false;
    if (ATT_TAB !== 'all' && a.person?.role !== ATT_TAB) return false;
    return true;
  });

  document.getElementById('att-filter-count').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  const body = document.getElementById('att-table-body');
  if (!rows.length) {
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="${canManage ? 8 : 7}">No attendance records match these filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (a) => `
    <tr>
      <td>${fmtDate(a.attendance_date)}</td>
      <td>${escapeHtml(a.person?.user_name || '-')}</td>
      <td><span class="badge-soft info">${escapeHtml(a.person?.role || '-')}</span></td>
      <td>${a.check_in ? fmtDateTime(a.check_in) : '-'}</td>
      <td>${a.check_out ? fmtDateTime(a.check_out) : '-'}</td>
      <td>${a.working_hours ? a.working_hours + 'h' : '-'}</td>
      <td><span class="badge-soft ${statusBadgeClass(a.status)}">${escapeHtml(a.status || '-')}</span></td>
      ${canManage ? `<td><button class="icon-btn-sm" data-att-edit="${a.attendance_id}" title="Edit"><i class="fa-solid fa-pen"></i></button></td>` : ''}
    </tr>`
    )
    .join('');

  if (canManage) {
    body.querySelectorAll('[data-att-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openAttendanceEditModal(btn.dataset.attEdit))
    );
  }
}

async function checkIn(profile) {
  const now = new Date();
  const { hour, minute } = officeNowClock();
  const isLate = hour > OFFICE_START_HOUR || (hour === OFFICE_START_HOUR && minute > OFFICE_START_MINUTE);
  const { error } = await sb.from('attendance').insert({
    user_id: profile.user_id,
    attendance_date: officeTodayStr(),
    check_in: now.toISOString(),
    status: isLate ? 'Late' : 'Present',
    device: navigator.userAgent.slice(0, 60),
  });
  if (error) return showToast(error.message, 'error');
  showToast(isLate ? 'Checked in. You are marked Late (office starts 10:30 AM).' : 'Checked in. Have a great day!', isLate ? 'error' : 'success');
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  loadAttendance(profile, roleMeta.canManageTeam);
}

async function checkOut(profile) {
  if (!ATT_TODAY) return;
  const now = new Date();
  const inTime = new Date(ATT_TODAY.check_in);
  const hours = Math.max(0, (now - inTime) / 3600000).toFixed(2);
  const { error } = await sb
    .from('attendance')
    .update({ check_out: now.toISOString(), working_hours: hours, status: hours < 4 ? 'Half Day' : ATT_TODAY.status })
    .eq('attendance_id', ATT_TODAY.attendance_id);
  if (error) return showToast(error.message, 'error');
  showToast('Checked out. See you tomorrow!', 'success');
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  loadAttendance(profile, roleMeta.canManageTeam);
}

// ---------- Admin / Super Admin: edit any attendance record ----------
// Converts a stored UTC timestamptz into the value a <input type="time">
// needs, expressed in office-local (Asia/Kolkata) time.
function toOfficeTimeInputValue(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

// Combines an attendance_date (YYYY-MM-DD) with a time-input value
// (HH:MM), both understood as office-local (Asia/Kolkata, UTC+5:30), into
// a UTC ISO timestamp suitable for storing in a timestamptz column.
function officeDateTimeToIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00+05:30`).toISOString();
}

function openAttendanceEditModal(attendanceId) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;
  const a = ATT_CACHE.find((x) => x.attendance_id === attendanceId);
  if (!a) return;

  const html = `
    <div class="tm-modal-backdrop show" id="modal-att-edit">
      <div class="tm-modal">
        <div class="tm-modal-head"><h3>Edit attendance</h3><button class="tm-modal-close" data-close-modal="modal-att-edit">&times;</button></div>
        <p class="mb-3 text-secondary" style="font-size:0.85rem;">${escapeHtml(a.person?.user_name || '-')} &middot; ${fmtDate(a.attendance_date)}</p>
        <div class="field-row">
          <div class="field"><label>Check-in time</label><input type="time" class="form-control-glass" style="padding-left:1rem;" id="ae-checkin" value="${toOfficeTimeInputValue(a.check_in)}" /></div>
          <div class="field"><label>Check-out time</label><input type="time" class="form-control-glass" style="padding-left:1rem;" id="ae-checkout" value="${toOfficeTimeInputValue(a.check_out)}" /></div>
        </div>
        <div class="field">
          <label>Status</label>
          <select class="form-control-glass" id="ae-status">
            ${['Present', 'Late', 'Half Day', 'Absent'].map((s) => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Remarks</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="ae-remarks" value="${escapeHtml(a.remarks || '')}" placeholder="Optional note about this correction" /></div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" style="color:var(--danger);border-color:var(--danger);" id="ae-delete">Delete record</button>
          <button class="btn-sm-ghost" data-close-modal="modal-att-edit">Cancel</button>
          <button class="btn-sm-gradient" id="ae-save">Save changes</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  document.getElementById('ae-save').addEventListener('click', async () => {
    const checkInTime = document.getElementById('ae-checkin').value;
    const checkOutTime = document.getElementById('ae-checkout').value;
    const status = document.getElementById('ae-status').value;
    const remarks = document.getElementById('ae-remarks').value.trim();

    const check_in = officeDateTimeToIso(a.attendance_date, checkInTime);
    const check_out = officeDateTimeToIso(a.attendance_date, checkOutTime);
    let working_hours = a.working_hours;
    if (check_in && check_out) {
      working_hours = Math.max(0, (new Date(check_out) - new Date(check_in)) / 3600000).toFixed(2);
    }

    const { error } = await sb
      .from('attendance')
      .update({ check_in, check_out, status, remarks: remarks || null, working_hours })
      .eq('attendance_id', attendanceId);
    if (error) return showToast(error.message, 'error');

    await logActivity(profile.user_id, `Edited attendance for ${a.person?.user_name || 'a user'} on ${a.attendance_date}`);
    showToast('Attendance updated.', 'success');
    closeModal('modal-att-edit');
    loadAttendance(profile, canManage);
  });

  document.getElementById('ae-delete').addEventListener('click', async () => {
    if (!confirm('Delete this attendance record? This cannot be undone.')) return;
    const { error } = await sb.from('attendance').delete().eq('attendance_id', attendanceId);
    if (error) return showToast(error.message, 'error');
    showToast('Attendance record deleted.', 'success');
    closeModal('modal-att-edit');
    loadAttendance(profile, canManage);
  });
}

// ---------- Monthly summary (own record, or everyone's if you can manage the team) ----------
async function renderMonthlySummary(canManage) {
  const profile = getStoredUser();
  const month = document.getElementById('att-month-input')?.value;
  if (!month) return;
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  let query = sb.from('attendance').select('*, person:users(user_name, role)').gte('attendance_date', from).lte('attendance_date', to);
  if (!canManage) query = query.eq('user_id', profile.user_id);
  const { data, error } = await query;
  const body = document.getElementById('att-month-body');
  if (error) {
    console.error(error);
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="7">Could not load the monthly summary.</td></tr>`;
    return;
  }

  const byPerson = new Map();
  (data || []).forEach((a) => {
    if (!byPerson.has(a.user_id)) {
      byPerson.set(a.user_id, { name: a.person?.user_name || '-', role: a.person?.role || '-', Present: 0, Late: 0, 'Half Day': 0, Absent: 0, hours: 0 });
    }
    const p = byPerson.get(a.user_id);
    if (p[a.status] !== undefined) p[a.status]++;
    p.hours += Number(a.working_hours || 0);
  });

  const monthLabel = new Date(`${month}-01T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  document.getElementById('att-month-count').textContent = `${byPerson.size} ${byPerson.size === 1 ? 'person' : 'people'} \u00b7 ${monthLabel}`;

  if (!byPerson.size) {
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="7">No attendance records for this month.</td></tr>`;
    return;
  }

  body.innerHTML = [...byPerson.values()]
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td><span class="badge-soft info">${escapeHtml(p.role)}</span></td>
      <td>${p.Present}</td>
      <td>${p.Late}</td>
      <td>${p['Half Day']}</td>
      <td>${p.Absent}</td>
      <td>${p.hours.toFixed(2)}h</td>
    </tr>`
    )
    .join('');
}

// ---------- Admin / Super Admin: add a record for any day (e.g. mark someone Absent) ----------
function openAttendanceAddModal(users) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  const html = `
    <div class="tm-modal-backdrop show" id="modal-att-add">
      <div class="tm-modal">
        <div class="tm-modal-head"><h3>Add attendance record</h3><button class="tm-modal-close" data-close-modal="modal-att-add">&times;</button></div>
        <div class="field">
          <label>Person</label>
          <select class="form-control-glass" id="aa-user">
            ${users.map((u) => `<option value="${u.user_id}">${escapeHtml(u.user_name)} (${escapeHtml(u.role)})</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Date</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="aa-date" value="${officeTodayStr()}" /></div>
        <div class="field">
          <label>Status</label>
          <select class="form-control-glass" id="aa-status">
            ${['Present', 'Late', 'Half Day', 'Absent'].map((s) => `<option>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field-row" id="aa-time-row">
          <div class="field"><label>Check-in time</label><input type="time" class="form-control-glass" style="padding-left:1rem;" id="aa-checkin" value="10:30" /></div>
          <div class="field"><label>Check-out time</label><input type="time" class="form-control-glass" style="padding-left:1rem;" id="aa-checkout" value="17:30" /></div>
        </div>
        <div class="field"><label>Remarks</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="aa-remarks" placeholder="Optional note, e.g. reason for absence" /></div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-att-add">Cancel</button>
          <button class="btn-sm-gradient" id="aa-save">Save record</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  const statusSel = document.getElementById('aa-status');
  const timeRow = document.getElementById('aa-time-row');
  statusSel.addEventListener('change', () => {
    timeRow.style.display = statusSel.value === 'Absent' ? 'none' : '';
  });

  document.getElementById('aa-save').addEventListener('click', async () => {
    const userId = document.getElementById('aa-user').value;
    const date = document.getElementById('aa-date').value;
    const status = statusSel.value;
    const remarks = document.getElementById('aa-remarks').value.trim();
    if (!userId || !date) return showToast('Pick a person and date.', 'error');

    const isAbsent = status === 'Absent';
    const check_in = isAbsent ? null : officeDateTimeToIso(date, document.getElementById('aa-checkin').value);
    const check_out = isAbsent ? null : officeDateTimeToIso(date, document.getElementById('aa-checkout').value);
    const working_hours = check_in && check_out ? Math.max(0, (new Date(check_out) - new Date(check_in)) / 3600000).toFixed(2) : null;

    const { error } = await sb
      .from('attendance')
      .upsert(
        { user_id: userId, attendance_date: date, check_in, check_out, working_hours, status, remarks: remarks || null },
        { onConflict: 'user_id,attendance_date' }
      );
    if (error) return showToast(error.message, 'error');

    await logActivity(profile.user_id, `Added/updated an attendance record for ${date}`);
    showToast('Attendance record saved.', 'success');
    closeModal('modal-att-add');
    loadAttendance(profile, canManage);
  });
}
