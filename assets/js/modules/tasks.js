// ===========================================
// Tasks module
// ===========================================
let TASKS_CACHE = [];
let TASKS_VIEW = 'kanban';

function renderTasksSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Work</span>
        <h2>Tasks</h2>
        <p>Everything assigned to you and your team, kept in sync with Supabase.</p>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <div class="view-toggle">
          <button data-task-view="kanban" class="active"><i class="fa-solid fa-table-cells-large"></i></button>
          <button data-task-view="list"><i class="fa-solid fa-list"></i></button>
        </div>
        <button class="btn-gradient" id="task-new-btn"><i class="fa-solid fa-plus"></i> New task</button>
      </div>
    </div>

    <div class="filter-bar">
      <input type="text" class="form-control-tm search" id="task-filter-search" placeholder="Search tasks..." />
      <select class="form-select-tm" id="task-filter-status">
        <option value="">All status</option>
        <option>Pending</option>
        <option>In Progress</option>
        <option>Completed</option>
        <option>Overdue</option>
      </select>
      <select class="form-select-tm" id="task-filter-priority">
        <option value="">All priority</option>
        <option>Low</option>
        <option>Medium</option>
        <option>High</option>
        <option>Urgent</option>
      </select>
      <select class="form-select-tm" id="task-filter-assignee"><option value="">All people</option></select>
      <span class="filter-count" id="task-filter-count"></span>
    </div>

    <div id="task-kanban" class="kanban-wrap"></div>
    <div id="task-list-wrap" class="tm-table-wrap" style="display:none;">
      <table class="tm-table">
        <thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th><th>Progress</th><th></th></tr></thead>
        <tbody id="task-list-body"></tbody>
      </table>
    </div>
  `;
}

async function initTasks(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;

  document.getElementById('task-new-btn').addEventListener('click', () => openTaskModal(profile));
  document.querySelectorAll('[data-task-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-task-view]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      TASKS_VIEW = btn.dataset.taskView;
      renderTaskViews();
    });
  });

  ['task-filter-search', 'task-filter-status', 'task-filter-priority', 'task-filter-assignee'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderTaskViews);
    document.getElementById(id).addEventListener('change', renderTaskViews);
  });

  if (canManage) {
    const users = await fetchActiveUsers();
    const sel = document.getElementById('task-filter-assignee');
    sel.innerHTML =
      '<option value="">All people</option>' +
      users.map((u) => `<option value="${u.user_id}">${escapeHtml(u.user_name)}</option>`).join('');
  } else {
    document.getElementById('task-filter-assignee').closest('.filter-bar').querySelector('#task-filter-assignee').style.display = 'none';
  }

  await loadTasks(profile, canManage);

  sb.channel('tasks-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks(profile, canManage))
    .subscribe();
}

async function loadTasks(profile, canManage) {
  let query = sb
    .from('tasks')
    .select('*, assignee:users!tasks_assigned_to_fkey(user_id,user_name,user_email), assigner:users!tasks_assigned_by_fkey(user_id,user_name)')
    .order('due_date', { ascending: true });

  if (!canManage) query = query.eq('assigned_to', profile.user_id);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return;
  }
  TASKS_CACHE = markOverdue(data || []);

  try {
    const ids = TASKS_CACHE.map((t) => t.task_id);
    if (ids.length) {
      const { data: files } = await sb.from('task_files').select('task_id').in('task_id', ids);
      const counts = {};
      (files || []).forEach((f) => { counts[f.task_id] = (counts[f.task_id] || 0) + 1; });
      TASKS_CACHE = TASKS_CACHE.map((t) => ({ ...t, file_count: counts[t.task_id] || 0 }));
    }
  } catch (e) { /* attachment counts are a nice-to-have, not critical */ }

  renderTaskViews();
}

function markOverdue(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.map((t) => {
    if (t.status !== 'Completed' && t.due_date && t.due_date < today) {
      return { ...t, status: 'Overdue' };
    }
    return t;
  });
}

function filteredTasks() {
  const search = (document.getElementById('task-filter-search')?.value || '').toLowerCase();
  const status = document.getElementById('task-filter-status')?.value || '';
  const priority = document.getElementById('task-filter-priority')?.value || '';
  const assignee = document.getElementById('task-filter-assignee')?.value || '';

  return TASKS_CACHE.filter((t) => {
    if (search && !(t.title || '').toLowerCase().includes(search)) return false;
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (assignee && t.assigned_to !== assignee) return false;
    return true;
  });
}

function renderTaskViews() {
  const tasks = filteredTasks();
  document.getElementById('task-filter-count').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

  document.getElementById('task-kanban').style.display = TASKS_VIEW === 'kanban' ? 'grid' : 'none';
  document.getElementById('task-list-wrap').style.display = TASKS_VIEW === 'list' ? 'block' : 'none';

  if (TASKS_VIEW === 'kanban') renderKanban(tasks);
  else renderTaskList(tasks);
}

function renderKanban(tasks) {
  const cols = ['Pending', 'In Progress', 'Completed', 'Overdue'];
  const el = document.getElementById('task-kanban');
  el.innerHTML = cols
    .map((col) => {
      const items = tasks.filter((t) => t.status === col);
      return `
      <div class="kanban-col">
        <div class="kanban-col-head"><span>${col}</span><span class="kanban-count">${items.length}</span></div>
        ${items.map((t) => taskCardHtml(t)).join('') || '<p class="text-secondary" style="font-size:0.78rem;">No tasks</p>'}
      </div>`;
    })
    .join('');
  el.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => openTaskDetail(card.dataset.id));
  });
}

function taskCardHtml(t) {
  return `
    <div class="task-card" data-id="${t.task_id}">
      <div class="t-title">${escapeHtml(t.title)}</div>
      <span class="badge-soft ${priorityBadge(t.priority)}">${escapeHtml(t.priority || 'Normal')}</span>
      ${t.file_count ? `<span class="badge-soft info" style="margin-left:0.35rem;"><i class="fa-solid fa-paperclip"></i> ${t.file_count}</span>` : ''}
      <div class="progress-inline mt-2"><div class="mini-progress"><span style="width:${t.progress || 0}%;"></span></div><span class="progress-pct">${t.progress || 0}%</span></div>
      <div class="t-meta">
        <span>${escapeHtml(t.assignee?.user_name || 'Unassigned')}</span>
        <span>${fmtDate(t.due_date)}</span>
      </div>
    </div>`;
}

function renderTaskList(tasks) {
  const body = document.getElementById('task-list-body');
  if (!tasks.length) {
    body.innerHTML = `<tr class="tm-empty-row"><td colspan="7">No tasks match these filters.</td></tr>`;
    return;
  }
  body.innerHTML = tasks
    .map(
      (t) => `
    <tr>
      <td><strong>${escapeHtml(t.title)}</strong>${t.file_count ? ` <i class="fa-solid fa-paperclip" title="${t.file_count} file(s) attached" style="color:var(--text-secondary);font-size:0.8rem;"></i>` : ''}</td>
      <td>${escapeHtml(t.assignee?.user_name || 'Unassigned')}</td>
      <td><span class="badge-soft ${priorityBadge(t.priority)}">${escapeHtml(t.priority || '-')}</span></td>
      <td><span class="badge-soft ${statusBadgeClass(t.status)}">${escapeHtml(t.status)}</span></td>
      <td>${fmtDate(t.due_date)}</td>
      <td><div class="progress-inline"><div class="mini-progress"><span style="width:${t.progress || 0}%;"></span></div><span class="progress-pct">${t.progress || 0}%</span></div></td>
      <td><button class="icon-btn-sm" data-view-task="${t.task_id}"><i class="fa-solid fa-eye"></i></button></td>
    </tr>`
    )
    .join('');
  body.querySelectorAll('[data-view-task]').forEach((btn) =>
    btn.addEventListener('click', () => openTaskDetail(btn.dataset.viewTask))
  );
}

function priorityBadge(p) {
  if (p === 'Urgent' || p === 'High') return 'danger';
  if (p === 'Medium') return 'warning';
  return 'info';
}

async function openTaskModal(profile) {
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;
  const users = canManage ? await fetchActiveUsers() : [profile];
  const departments = await fetchDepartments().catch(() => []);

  const html = `
    <div class="tm-modal-backdrop show" id="modal-task-new">
      <div class="tm-modal">
        <div class="tm-modal-head"><h3>New task</h3><button class="tm-modal-close" data-close-modal="modal-task-new">&times;</button></div>
        <div class="field"><label>Title</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="nt-title" placeholder="Ship the onboarding flow" /></div>
        <div class="field"><label>Description</label><textarea class="form-control-glass" id="nt-desc" placeholder="What needs to happen?"></textarea></div>
        <div class="field-row">
          <div class="field"><label>Assign to${canManage ? ' <span class="text-secondary" style="font-weight:400;">(select multiple to assign the same task to everyone picked)</span>' : ''}</label>
            <select class="form-control-glass" id="nt-assignee" ${canManage ? 'multiple size="5"' : ''}>
              ${users.map((u) => `<option value="${u.user_id}" ${u.user_id === profile.user_id ? 'selected' : ''}>${escapeHtml(u.user_name)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Department</label>
            <select class="form-control-glass" id="nt-dept"><option value="">None</option>${departments.map((d) => `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Priority</label>
            <select class="form-control-glass" id="nt-priority">
              <option>Low</option><option selected>Medium</option><option>High</option><option>Urgent</option>
            </select>
          </div>
          <div class="field"><label>Due date</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="nt-due" /></div>
        </div>
        <div class="field">
          <label>Attach files <span class="text-secondary" style="font-weight:400;">(optional)</span></label>
          <input type="file" id="nt-files" multiple hidden />
          <button type="button" class="btn-sm-ghost" id="nt-files-btn"><i class="fa-solid fa-paperclip"></i> Add files or photos</button>
          <div id="nt-files-list" class="mt-2"></div>
          <span class="photo-field-status" id="nt-files-status"></span>
        </div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-task-new">Cancel</button>
          <button class="btn-sm-gradient" id="nt-submit">Create task</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  // ---------- Optional file attachments, uploaded once the task exists ----------
  let pendingFiles = [];
  const filesListEl = document.getElementById('nt-files-list');
  const renderPendingFiles = () => {
    filesListEl.innerHTML = pendingFiles
      .map((f, i) => `<div class="d-flex align-items-center gap-2" style="font-size:0.82rem;margin-bottom:0.25rem;"><i class="fa-solid fa-file"></i> ${escapeHtml(f.name)} <button type="button" class="icon-btn-sm danger" data-remove-pending-file="${i}" style="width:22px;height:22px;"><i class="fa-solid fa-xmark"></i></button></div>`)
      .join('');
    filesListEl.querySelectorAll('[data-remove-pending-file]').forEach((btn) =>
      btn.addEventListener('click', () => {
        pendingFiles.splice(Number(btn.dataset.removePendingFile), 1);
        renderPendingFiles();
      })
    );
  };
  document.getElementById('nt-files-btn').addEventListener('click', () => document.getElementById('nt-files').click());
  document.getElementById('nt-files').addEventListener('change', (e) => {
    pendingFiles = pendingFiles.concat(Array.from(e.target.files || []));
    renderPendingFiles();
    e.target.value = '';
  });

  document.getElementById('nt-submit').addEventListener('click', async () => {
    const title = document.getElementById('nt-title').value.trim();
    if (!title) return showToast('Give the task a title.', 'error');
    const assigneeSelect = document.getElementById('nt-assignee');
    const assigneeIds = canManage
      ? Array.from(assigneeSelect.selectedOptions).map((o) => o.value)
      : [assigneeSelect.value];
    if (!assigneeIds.length) return showToast('Pick at least one person to assign this to.', 'error');

    const basePayload = {
      title,
      description: document.getElementById('nt-desc').value.trim(),
      assigned_by: profile.user_id,
      department_id: document.getElementById('nt-dept').value || null,
      priority: document.getElementById('nt-priority').value,
      due_date: document.getElementById('nt-due').value || null,
      status: 'Pending',
      progress: 0,
    };

    const { data: inserted, error } = await sb
      .from('tasks')
      .insert(assigneeIds.map((assigned_to) => ({ ...basePayload, assigned_to })))
      .select('task_id, assigned_to');
    if (error) return showToast(error.message, 'error');

    // Optional attachments get uploaded once and linked to every created task.
    if (pendingFiles.length) {
      document.getElementById('nt-files-status').textContent = 'Uploading attachments...';
      try {
        const uploaded = [];
        for (const file of pendingFiles) {
          const url = await uploadPhotoToBucket(STORAGE_BUCKETS.taskFiles, file);
          uploaded.push({ file_url: url, file_name: file.name });
        }
        const fileRows = [];
        (inserted || []).forEach((row) => {
          uploaded.forEach((u) => fileRows.push({ task_id: row.task_id, file_url: u.file_url, file_name: u.file_name, uploaded_by: profile.user_id }));
        });
        if (fileRows.length) await sb.from('task_files').insert(fileRows);
      } catch (err) {
        console.error(err);
        showToast('Task created, but attaching files failed.', 'error');
      }
    }

    await notifyUsers(assigneeIds, 'New task assigned', `${profile.user_name} assigned you "${title}"`, 'page-tasks');
    await logActivity(profile.user_id, `Created task "${title}"${assigneeIds.length > 1 ? ` for ${assigneeIds.length} people` : ''}`);
    showToast(assigneeIds.length > 1 ? `Task created for ${assigneeIds.length} people.` : 'Task created.', 'success');
    closeModal('modal-task-new');
    loadTasks(profile, canManage);
  });
}

async function openTaskDetail(taskId) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canManage = roleMeta.canManageTeam;
  let t = TASKS_CACHE.find((x) => x.task_id === taskId);
  if (!t) {
    const { data, error } = await sb
      .from('tasks')
      .select('*, assignee:users!tasks_assigned_to_fkey(user_id,user_name,user_email), assigner:users!tasks_assigned_by_fkey(user_id,user_name)')
      .eq('task_id', taskId)
      .maybeSingle();
    if (error || !data) return showToast('Could not load that task.', 'error');
    t = markOverdue([data])[0];
    TASKS_CACHE = [...TASKS_CACHE, t];
  }

  const { data: checklist } = await sb.from('task_checklists').select('*').eq('task_id', taskId).order('created_at');
  const { data: files } = await sb.from('task_files').select('*').eq('task_id', taskId).order('created_at');
  const assignableUsers = canManage ? await fetchActiveUsers().catch(() => []) : [];
  const departments = canManage ? await fetchDepartments().catch(() => []) : [];

  const isOwner = t.assigned_to === profile.user_id;
  const html = `
    <div class="tm-modal-backdrop show" id="modal-task-detail">
      <div class="tm-modal wide">
        <div class="tm-modal-head">
          ${canManage
            ? `<input type="text" class="form-control-glass" style="padding-left:0.8rem;font-weight:600;" id="td-title" value="${escapeHtml(t.title)}" />`
            : `<h3>${escapeHtml(t.title)}</h3>`}
          <button class="tm-modal-close" data-close-modal="modal-task-detail">&times;</button>
        </div>

        ${canManage
          ? `<div class="field"><label>Description</label><textarea class="form-control-glass" id="td-desc">${escapeHtml(t.description || '')}</textarea></div>`
          : `<p class="mb-3">${escapeHtml(t.description || 'No description provided.')}</p>`}

        ${canManage ? `
        <div class="field-row mb-2">
          <div class="field"><label>Assignee</label>
            <select class="form-control-glass" id="td-assignee">
              ${assignableUsers.map((u) => `<option value="${u.user_id}" ${u.user_id === t.assigned_to ? 'selected' : ''}>${escapeHtml(u.user_name)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Department</label>
            <select class="form-control-glass" id="td-dept">
              <option value="">None</option>
              ${departments.map((d) => `<option value="${d.department_id}" ${d.department_id === t.department_id ? 'selected' : ''}>${escapeHtml(d.department_name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row mb-2">
          <div class="field"><label>Priority</label>
            <select class="form-control-glass" id="td-priority">
              ${['Low', 'Medium', 'High', 'Urgent'].map((p) => `<option ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Due date</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="td-due" value="${t.due_date || ''}" /></div>
        </div>` : `
        <div class="detail-grid mb-3">
          <div><div class="dl-label">Assignee</div><div class="dl-value">${escapeHtml(t.assignee?.user_name || '-')}</div></div>
          <div><div class="dl-label">Assigned by</div><div class="dl-value">${escapeHtml(t.assigner?.user_name || '-')}</div></div>
          <div><div class="dl-label">Priority</div><div class="dl-value">${escapeHtml(t.priority || '-')}</div></div>
          <div><div class="dl-label">Due date</div><div class="dl-value">${fmtDate(t.due_date)}</div></div>
        </div>`}

        <div class="field-row">
          <div class="field"><label>Status</label>
            <select class="form-control-glass" id="td-status" ${!canManage && !isOwner ? 'disabled' : ''}>
              ${['Pending', 'In Progress', 'Completed'].map((s) => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Progress (<span id="td-progress-val">${t.progress || 0}</span>%)</label>
            <input type="range" min="0" max="100" id="td-progress" value="${t.progress || 0}" ${!canManage && !isOwner ? 'disabled' : ''} />
          </div>
        </div>

        <div class="field">
          <label>Checklist</label>
          <div id="td-checklist">${(checklist || []).map(checklistItemHtml).join('') || '<p class="text-secondary" style="font-size:0.82rem;">No checklist items yet.</p>'}</div>
          <div class="d-flex gap-2 mt-2">
            <input type="text" class="form-control-glass" style="padding-left:1rem;" id="td-checklist-new" placeholder="Add a checklist item" />
            <button class="btn-sm-ghost" id="td-checklist-add">Add</button>
          </div>
        </div>

        <div class="field">
          <label>Files</label>
          <div id="td-files-list">${(files || []).map(taskFileHtml).join('') || '<p class="text-secondary" style="font-size:0.82rem;">No files attached yet.</p>'}</div>
          ${(canManage || isOwner) ? `
          <input type="file" id="td-file-input" multiple hidden />
          <button type="button" class="btn-sm-ghost mt-2" id="td-file-add"><i class="fa-solid fa-paperclip"></i> Add files or photos</button>
          <span class="photo-field-status" id="td-file-status"></span>` : ''}
        </div>

        ${isOwner ? `
        <div class="field">
          <label>Request an extension</label>
          <div class="d-flex gap-2">
            <input type="date" class="form-control-glass" style="padding-left:1rem;" id="td-ext-date" />
            <input type="text" class="form-control-glass" style="padding-left:1rem;" id="td-ext-reason" placeholder="Reason" />
            <button class="btn-sm-ghost" id="td-ext-submit">Request</button>
          </div>
        </div>` : ''}

        ${t.extension_requested && canManage ? `
        <div class="glass-card mb-3" style="padding:0.9rem;">
          <strong>Extension requested</strong> to ${fmtDate(t.extended_date)} &mdash; ${escapeHtml(t.extension_reason || '')}
          <div class="d-flex gap-2 mt-2">
            <button class="btn-sm-gradient" id="td-ext-approve">Approve</button>
            <button class="btn-sm-ghost" id="td-ext-reject">Reject</button>
          </div>
        </div>` : ''}

        <div class="tm-modal-actions">
          ${canManage ? `<button class="btn-sm-ghost" style="color:var(--danger);border-color:var(--danger);" id="td-delete">Delete</button>` : ''}
          <button class="btn-sm-ghost" data-close-modal="modal-task-detail">Close</button>
          <button class="btn-sm-gradient" id="td-save">Save changes</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  // Live percentage while dragging the slider, not just after save.
  document.getElementById('td-progress').addEventListener('input', (e) => {
    document.getElementById('td-progress-val').textContent = e.target.value;
  });

  document.getElementById('td-checklist-add').addEventListener('click', async () => {
    const title = document.getElementById('td-checklist-new').value.trim();
    if (!title) return;
    await sb.from('task_checklists').insert({ task_id: taskId, title, status: false });
    openTaskDetail(taskId);
  });
  document.querySelectorAll('[data-checklist-toggle]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      await sb.from('task_checklists').update({ status: cb.checked }).eq('id', cb.dataset.checklistToggle);
    })
  );

  document.getElementById('td-file-add')?.addEventListener('click', () => document.getElementById('td-file-input').click());
  document.getElementById('td-file-input')?.addEventListener('change', async (e) => {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (!newFiles.length) return;
    const status = document.getElementById('td-file-status');
    status.textContent = 'Uploading...';
    try {
      for (const file of newFiles) {
        const url = await uploadPhotoToBucket(STORAGE_BUCKETS.taskFiles, file);
        await sb.from('task_files').insert({ task_id: taskId, file_url: url, file_name: file.name, uploaded_by: profile.user_id });
      }
      status.textContent = '';
      openTaskDetail(taskId);
    } catch (err) {
      console.error(err);
      status.textContent = '';
      showToast(err.message || 'File upload failed.', 'error');
    }
  });

  if (isOwner) {
    document.getElementById('td-ext-submit')?.addEventListener('click', async () => {
      const date = document.getElementById('td-ext-date').value;
      const reason = document.getElementById('td-ext-reason').value.trim();
      if (!date || !reason) return showToast('Add a date and reason.', 'error');
      await sb.from('tasks').update({
        extension_requested: true, extension_reason: reason, extended_date: date, approval_status: 'Pending',
      }).eq('task_id', taskId);
      await notifyUsers([t.assigned_by], 'Extension requested', `${profile.user_name} requested more time on "${t.title}"`, 'page-tasks');
      showToast('Extension requested.', 'success');
      closeModal('modal-task-detail');
      loadTasks(profile, canManage);
    });
  }

  document.getElementById('td-ext-approve')?.addEventListener('click', async () => {
    await sb.from('tasks').update({ due_date: t.extended_date, extension_requested: false, approval_status: 'Approved' }).eq('task_id', taskId);
    await notifyUsers([t.assigned_to], 'Extension approved', `Your extension on "${t.title}" was approved.`, 'page-tasks');
    closeModal('modal-task-detail');
    loadTasks(profile, canManage);
  });
  document.getElementById('td-ext-reject')?.addEventListener('click', async () => {
    await sb.from('tasks').update({ extension_requested: false, approval_status: 'Rejected' }).eq('task_id', taskId);
    await notifyUsers([t.assigned_to], 'Extension rejected', `Your extension on "${t.title}" was rejected.`, 'page-tasks');
    closeModal('modal-task-detail');
    loadTasks(profile, canManage);
  });

  document.getElementById('td-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete this task?')) return;
    const { error } = await sb.from('tasks').delete().eq('task_id', taskId);
    if (error) return showToast(error.message, 'error');
    await logActivity(profile.user_id, `Deleted task "${t.title}"`);
    showToast('Task deleted.', 'success');
    closeModal('modal-task-detail');
    loadTasks(profile, canManage);
  });

  document.getElementById('td-save').addEventListener('click', async () => {
    const status = document.getElementById('td-status').value;
    const progress = Number(document.getElementById('td-progress').value);
    const patch = { status, progress };
    if (status === 'Completed') patch.completed_date = new Date().toISOString().slice(0, 10);

    let reassigned = false;
    if (canManage) {
      const newTitle = document.getElementById('td-title').value.trim();
      if (!newTitle) return showToast('Give the task a title.', 'error');
      patch.title = newTitle;
      patch.description = document.getElementById('td-desc').value.trim();
      const newAssignee = document.getElementById('td-assignee').value;
      reassigned = newAssignee !== t.assigned_to;
      patch.assigned_to = newAssignee;
      patch.department_id = document.getElementById('td-dept').value || null;
      patch.priority = document.getElementById('td-priority').value;
      patch.due_date = document.getElementById('td-due').value || null;
    }

    const { error } = await sb.from('tasks').update(patch).eq('task_id', taskId);
    if (error) return showToast(error.message, 'error');

    if (status === 'Completed') {
      await notifyUsers([t.assigned_by], 'Task completed', `${profile.user_name} completed "${t.title}"`, 'page-tasks');
    }
    if (reassigned) {
      await notifyUsers([patch.assigned_to], 'Task assigned to you', `${profile.user_name} assigned you "${patch.title}"`, 'page-tasks');
    }
    await logActivity(profile.user_id, `Updated task "${patch.title || t.title}"`);
    showToast('Task updated.', 'success');
    closeModal('modal-task-detail');
    loadTasks(profile, canManage);
  });
}

function taskFileHtml(f) {
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(f.file_name || f.file_url || '');
  return `
    <a class="task-file-row" href="${escapeHtml(f.file_url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;margin-bottom:0.35rem;color:var(--text-primary);text-decoration:none;">
      <i class="fa-solid ${isImage ? 'fa-image' : 'fa-file'}"></i>
      <span style="text-decoration:underline;">${escapeHtml(f.file_name || 'Attachment')}</span>
    </a>`;
}

function checklistItemHtml(item) {
  return `<label class="checklist-item"><input type="checkbox" data-checklist-toggle="${item.id}" ${item.status ? 'checked' : ''}/> <span style="${item.status ? 'text-decoration:line-through;color:var(--text-secondary);' : ''}">${escapeHtml(item.title)}</span></label>`;
}
