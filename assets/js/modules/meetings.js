// ===========================================
// Meetings module
// ===========================================
let MEET_CACHE = [];

function renderMeetingsSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Sync up</span>
        <h2>Meetings</h2>
        <p>Schedule and track meetings across the team.</p>
      </div>
      <button class="btn-gradient" id="meet-new-btn"><i class="fa-solid fa-plus"></i> Schedule meeting</button>
    </div>

    <div class="filter-bar">
      <select class="form-select-tm" id="meet-filter-when"><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="">All</option></select>
      <input type="text" class="form-control-tm search" id="meet-filter-search" placeholder="Search meetings..." />
      <span class="filter-count" id="meet-filter-count"></span>
    </div>

    <div id="meet-list"></div>
  `;
}

async function initMeetings(profile) {
  document.getElementById('meet-new-btn').addEventListener('click', () => openMeetingModal(profile));
  document.getElementById('meet-filter-when').addEventListener('change', renderMeetingList);
  document.getElementById('meet-filter-search').addEventListener('input', renderMeetingList);
  await loadMeetings(profile);
}

async function loadMeetings(profile) {
  const { data: myMeetingIds } = await sb.from('meeting_attendees').select('meeting_id').eq('user_id', profile.user_id);
  const ids = (myMeetingIds || []).map((m) => m.meeting_id);

  const { data, error } = await sb
    .from('meetings')
    .select('*, host:users(user_name)')
    .or(`created_by.eq.${profile.user_id}${ids.length ? ',meeting_id.in.(' + ids.join(',') + ')' : ''}`)
    .order('meeting_date', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  MEET_CACHE = data || [];
  renderMeetingList();
}

function renderMeetingList() {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const when = document.getElementById('meet-filter-when')?.value;
  const search = (document.getElementById('meet-filter-search')?.value || '').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  const rows = MEET_CACHE.filter((m) => {
    if (when === 'upcoming' && m.meeting_date < today) return false;
    if (when === 'past' && m.meeting_date >= today) return false;
    if (search && !(m.title || '').toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('meet-filter-count').textContent = `${rows.length} meeting${rows.length === 1 ? '' : 's'}`;
  const list = document.getElementById('meet-list');
  if (!rows.length) {
    list.innerHTML = `<div class="glass-card activity-card"><i class="fa-solid fa-video"></i><p>No meetings match these filters.</p></div>`;
    return;
  }
  list.innerHTML = rows
    .map((m) => {
      const canDelete = roleMeta.isAdmin || m.created_by === profile.user_id;
      return `
    <div class="glass-card mb-3 glass-card--hover">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h3 class="mb-1">${escapeHtml(m.title)}</h3>
          <p class="mb-1">${escapeHtml(m.description || '')}</p>
          <span class="badge-soft info"><i class="fa-regular fa-calendar"></i> ${fmtDate(m.meeting_date)} ${m.meeting_time ? 'at ' + m.meeting_time.slice(0, 5) : ''}</span>
          <span class="text-secondary" style="font-size:0.78rem;margin-left:0.6rem;">Hosted by ${escapeHtml(m.host?.user_name || '-')}</span>
        </div>
        <div class="d-flex gap-2">
          ${m.meeting_link ? `<a class="btn-sm-gradient" href="${escapeHtml(m.meeting_link)}" target="_blank" rel="noopener">Join <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
          ${canDelete ? `<button class="icon-btn-sm danger" data-meet-delete="${m.meeting_id}" title="Delete meeting"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
    })
    .join('');

  list.querySelectorAll('[data-meet-delete]').forEach((btn) =>
    btn.addEventListener('click', () => deleteMeeting(btn.dataset.meetDelete, profile))
  );
}

async function deleteMeeting(meetingId, profile) {
  if (!confirm('Delete this meeting? Attendees will no longer see it.')) return;
  const { error } = await sb.from('meetings').delete().eq('meeting_id', meetingId);
  if (error) return showToast(error.message, 'error');
  showToast('Meeting deleted.', 'success');
  loadMeetings(profile);
}

async function openMeetingModal(profile) {
  const users = (await fetchActiveUsers()).filter((u) => u.user_id !== profile.user_id);
  const html = `
    <div class="tm-modal-backdrop show" id="modal-meeting-new">
      <div class="tm-modal wide">
        <div class="tm-modal-head"><h3>Schedule a meeting</h3><button class="tm-modal-close" data-close-modal="modal-meeting-new">&times;</button></div>
        <div class="field"><label>Title</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="mt-title" placeholder="Weekly sync" /></div>
        <div class="field-row">
          <div class="field"><label>Date</label><input type="date" class="form-control-glass" style="padding-left:1rem;" id="mt-date" /></div>
          <div class="field"><label>Time</label><input type="time" class="form-control-glass" style="padding-left:1rem;" id="mt-time" /></div>
        </div>
        <div class="field"><label>Meeting link</label><input type="url" class="form-control-glass" style="padding-left:1rem;" id="mt-link" placeholder="https://meet.google.com/..." /></div>
        <div class="field"><label>Description</label><textarea class="form-control-glass" id="mt-desc"></textarea></div>
        <div class="field"><label>Invite people</label>
          <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--r-md);padding:0.6rem;">
            ${users.map((u) => `<label class="checklist-item"><input type="checkbox" value="${u.user_id}" class="mt-attendee" /> ${escapeHtml(u.user_name)}</label>`).join('') || '<p class="text-secondary">No other people yet.</p>'}
          </div>
        </div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-meeting-new">Cancel</button>
          <button class="btn-sm-gradient" id="mt-submit">Schedule</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  document.getElementById('mt-submit').addEventListener('click', async () => {
    const title = document.getElementById('mt-title').value.trim();
    const meeting_date = document.getElementById('mt-date').value;
    if (!title || !meeting_date) return showToast('Add a title and date.', 'error');

    const payload = {
      title,
      meeting_date,
      meeting_time: document.getElementById('mt-time').value || null,
      meeting_link: document.getElementById('mt-link').value.trim() || null,
      description: document.getElementById('mt-desc').value.trim(),
      created_by: profile.user_id,
    };
    const { data: meeting, error } = await sb.from('meetings').insert(payload).select().single();
    if (error) return showToast(error.message, 'error');

    const attendeeIds = Array.from(document.querySelectorAll('.mt-attendee:checked')).map((cb) => cb.value);
    const rows = [profile.user_id, ...attendeeIds].map((user_id) => ({ meeting_id: meeting.meeting_id, user_id }));
    await sb.from('meeting_attendees').insert(rows);

    await notifyUsers(attendeeIds, 'New meeting invite', `${profile.user_name} invited you to "${title}" on ${fmtDate(meeting_date)}`, 'page-meetings');
    await logActivity(profile.user_id, `Scheduled meeting "${title}"`);
    showToast('Meeting scheduled.', 'success');
    closeModal('modal-meeting-new');
    loadMeetings(profile);
  });
}
