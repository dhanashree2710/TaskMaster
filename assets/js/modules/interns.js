// ===========================================
// Interns module
// ===========================================
let INT_CACHE = [];
let INT_MENTORS = [];

function renderInternsSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">People</span>
        <h2>Interns</h2>
        <p>Track intern projects, mentors, and evaluations.</p>
      </div>
      <a class="btn-gradient" data-register-only href="register.html"><i class="fa-solid fa-user-plus"></i> Register intern</a>
    </div>

    <div class="filter-bar">
      <input type="text" class="form-control-tm search" id="int-filter-search" placeholder="Search by name, college..." />
      <select class="form-select-tm" id="int-filter-status"><option value="">All status</option><option>Active</option><option>Completed</option><option>Terminated</option></select>
      <span class="filter-count" id="int-filter-count"></span>
    </div>

    <div class="tm-table-wrap">
      <table class="tm-table">
        <thead><tr><th>Intern</th><th>College</th><th>Mentor</th><th>Duration</th><th>Status</th><th></th></tr></thead>
        <tbody id="int-table-body"></tbody>
      </table>
    </div>
  `;
}

async function initInterns(profile) {
  ['int-filter-search', 'int-filter-status'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderInternTable);
    document.getElementById(id).addEventListener('change', renderInternTable);
  });

  const { data: mentors } = await sb.from('employees').select('employee_id, first_name, last_name');
  INT_MENTORS = mentors || [];

  await loadInterns();
}

async function loadInterns() {
  const { data, error } = await sb
    .from('interns')
    .select('*, mentor_row:employees!interns_mentor_fkey(first_name,last_name)')
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  INT_CACHE = data || [];
  renderInternTable();
}

function renderInternTable() {
  const search = (document.getElementById('int-filter-search')?.value || '').toLowerCase();
  const status = document.getElementById('int-filter-status')?.value || '';

  const rows = INT_CACHE.filter((i) => {
    const name = fullName(i).toLowerCase();
    if (search && !(name.includes(search) || (i.college || '').toLowerCase().includes(search))) return false;
    if (status && i.status !== status) return false;
    return true;
  });

  document.getElementById('int-filter-count').textContent = `${rows.length} intern${rows.length === 1 ? '' : 's'}`;
  const body = document.getElementById('int-table-body');
  if (!rows.length) {
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="6">No interns match these filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (i) => `
    <tr>
      <td><div class="person-cell">${avatarHtml(fullName(i), i.photo_url)}<div><div class="p-name">${escapeHtml(fullName(i))}</div><div class="p-sub">${escapeHtml(i.email || '')}</div></div></div></td>
      <td>${escapeHtml(i.college || '-')}</td>
      <td>${i.mentor_row ? escapeHtml(fullName(i.mentor_row)) : '-'}</td>
      <td>${fmtDate(i.start_date)} &rarr; ${fmtDate(i.end_date)}</td>
      <td><span class="badge-soft ${statusBadgeClass(i.status)}">${escapeHtml(i.status)}</span></td>
      <td><button class="icon-btn-sm" data-int-view="${i.intern_id}"><i class="fa-solid fa-eye"></i></button></td>
    </tr>`
    )
    .join('');
  body.querySelectorAll('[data-int-view]').forEach((btn) => btn.addEventListener('click', () => openInternDetail(btn.dataset.intView)));
}

async function openInternDetail(id) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const i = INT_CACHE.find((x) => x.intern_id === id);
  if (!i) return;
  const canEdit = roleMeta.canManageTeam;

  const html = `
    <div class="tm-modal-backdrop show" id="modal-int-detail">
      <div class="tm-modal wide">
        <div class="tm-modal-head"><h3>${escapeHtml(fullName(i))}</h3><button class="tm-modal-close" data-close-modal="modal-int-detail">&times;</button></div>
        <div class="detail-grid mb-3">
          <div><div class="dl-label">Email</div><div class="dl-value">${escapeHtml(i.email || '-')}</div></div>
          <div><div class="dl-label">College</div><div class="dl-value">${escapeHtml(i.college || '-')}</div></div>
          <div><div class="dl-label">Start date</div><div class="dl-value">${fmtDate(i.start_date)}</div></div>
          <div><div class="dl-label">End date</div><div class="dl-value">${fmtDate(i.end_date)}</div></div>
        </div>

        ${renderPhotoField('id-photo', { label: 'Photo', url: i.photo_url || '' })}

        <div class="field"><label>Project</label><textarea class="form-control-glass" id="id-project" ${canEdit ? '' : 'disabled'}>${escapeHtml(i.project || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Mentor</label>
            <select class="form-control-glass" id="id-mentor" ${canEdit ? '' : 'disabled'}>
              <option value="">None</option>
              ${INT_MENTORS.map((m) => `<option value="${m.employee_id}" ${m.employee_id === i.mentor ? 'selected' : ''}>${escapeHtml(fullName(m))}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Status</label>
            <select class="form-control-glass" id="id-status" ${canEdit ? '' : 'disabled'}>
              ${['Active', 'Completed', 'Terminated'].map((s) => `<option ${i.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field"><label>Evaluation notes</label><textarea class="form-control-glass" id="id-eval" ${canEdit ? '' : 'disabled'}>${escapeHtml(i.evaluation || '')}</textarea></div>

        ${canEdit ? `<div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-int-detail">Close</button>
          <button class="btn-sm-gradient" id="id-save">Save changes</button>
        </div>` : ''}
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;
  wirePhotoField('id-photo', STORAGE_BUCKETS.internPhotos);

  document.getElementById('id-save')?.addEventListener('click', async () => {
    const patch = {
      project: document.getElementById('id-project').value.trim(),
      mentor: document.getElementById('id-mentor').value || null,
      status: document.getElementById('id-status').value,
      evaluation: document.getElementById('id-eval').value.trim(),
      photo_url: document.getElementById('id-photo').value.trim() || null,
    };
    const { error } = await sb.from('interns').update(patch).eq('intern_id', id);
    if (error) return showToast(error.message, 'error');
    if (i.user_id) await sb.from('users').update({ status: patch.status === 'Active' ? 'Active' : 'Inactive' }).eq('user_id', i.user_id);
    await logActivity(profile.user_id, `Updated intern ${fullName(i)}`);
    showToast('Intern updated.', 'success');
    closeModal('modal-int-detail');
    loadInterns();
  });
}
