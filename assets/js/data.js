// ===========================================
// Shared data helpers used across every module
// ===========================================

// ---------- People lookups ----------
async function fetchAllUsers() {
  const { data, error } = await sb.from('users').select('*').order('user_name');
  if (error) throw error;
  return data || [];
}

async function fetchActiveUsers() {
  const { data, error } = await sb.from('users').select('*').eq('status', 'Active').order('user_name');
  if (error) throw error;
  return data || [];
}

async function fetchDepartments() {
  const { data, error } = await sb.from('departments').select('*').order('department_name');
  if (error) throw error;
  return data || [];
}

// ---------- Activity log ----------
async function logActivity(userId, activity) {
  try {
    await sb.from('activity_logs').insert({ user_id: userId, activity, device: navigator.userAgent.slice(0, 120) });
  } catch (e) {
    // Non-critical, never block the calling action on a logging failure.
    console.warn('activity log failed', e);
  }
}

// ---------- Notifications ----------
// Creates one notification row per receiver and (best-effort) pings the
// browser Notification API so it can surface on desktop or an installed
// mobile home-screen app.
async function notifyUsers(userIds, title, message, link = '') {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  const rows = ids.map((receiver_id) => ({ title, message, link, receiver_id }));
  const { error } = await sb.from('notifications').insert(rows);
  if (error) console.warn('notifyUsers failed', error);

  const me = getStoredUser();
  if (me && ids.includes(me.user_id)) {
    pushBrowserNotification(title, message);
  }
}

async function notifyAdmins(title, message, link = '') {
  const { data, error } = await sb.from('users').select('user_id').in('role', ['Super Admin', 'Admin']);
  if (error) return;
  await notifyUsers(data.map((u) => u.user_id), title, message, link);
}

async function notifyManagers(title, message, link = '') {
  const { data, error } = await sb
    .from('users')
    .select('user_id')
    .in('role', ['Super Admin', 'Admin', 'Manager']);
  if (error) return;
  await notifyUsers(data.map((u) => u.user_id), title, message, link);
}

function pushBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: 'assets/img/logo.png' });
    } catch (e) {
      /* some mobile browsers restrict this outside a service worker; ignore */
    }
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

// ---------- Small formatting helpers reused by modules ----------
// The office runs on Indian Standard Time, so every timestamp is shown in
// that zone regardless of what timezone the viewer's device is set to.
// Without this, a check-in stored correctly as UTC could render as the
// wrong wall-clock time on a device with a different/misconfigured
// timezone, which is what caused attendance to look like it had the
// "wrong" time even though the stored value was correct.
const OFFICE_TIMEZONE = 'Asia/Kolkata';

function fmtDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: OFFICE_TIMEZONE });
}

function fmtDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: OFFICE_TIMEZONE });
}

// Returns today's date as YYYY-MM-DD in office-local time (not UTC, not
// the device's own timezone) so attendance_date always lines up with the
// office day even for devices near a date boundary.
function officeTodayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: OFFICE_TIMEZONE });
}

// Returns { hour, minute } for "now" in office-local time.
function officeNowClock() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OFFICE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { hour, minute };
}

function fmtTimeAgo(d) {
  if (!d) return '-';
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fullName(personRow) {
  if (!personRow) return '-';
  return [personRow.first_name, personRow.middle_name, personRow.last_name].filter(Boolean).join(' ') || '-';
}

// Renders a round avatar: the person's photo if they have one, initials otherwise.
function avatarHtml(name, photoUrl, sizePx) {
  const size = sizePx ? ` style="width:${sizePx}px;height:${sizePx}px;font-size:${Math.round(sizePx * 0.32)}px;"` : '';
  if (photoUrl) {
    return `<div class="avatar"${size}><img src="${escapeHtml(photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" /></div>`;
  }
  return `<div class="avatar"${size}>${getInitials(name)}</div>`;
}

function statusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (['active', 'present', 'approved', 'completed', 'success'].includes(s)) return 'success';
  if (['pending', 'in progress', 'half day'].includes(s)) return 'warning';
  if (['inactive', 'absent', 'rejected', 'overdue', 'cancelled'].includes(s)) return 'danger';
  return 'info';
}

// Simple client-side modal helper shared by every module.
function openModal(id) {
  document.getElementById(id)?.classList.add('show');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
}
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close-modal]');
  if (closer) closeModal(closer.dataset.closeModal);
  if (e.target.classList && e.target.classList.contains('tm-modal-backdrop')) {
    e.target.classList.remove('show');
  }
});
