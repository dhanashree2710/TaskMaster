// ===========================================
// Notification center (bell icon) + phone alerts
// ===========================================
let notifChannel = null;

async function initNotifications(profile) {
  renderNotifBell();
  await refreshNotifications(profile);
  subscribeNotifRealtime(profile);

  // Ask for phone/desktop notification permission once, quietly.
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => requestNotificationPermission(), 1500);
  }
}

function renderNotifBell() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.getElementById('notif-btn')) return;

  const wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML = `
    <button class="icon-btn-round" id="notif-btn" title="Notifications">
      <i class="fa-regular fa-bell"></i>
      <span class="notif-dot" id="notif-dot" style="display:none;"></span>
    </button>
    <div class="notif-panel" id="notif-panel">
      <div class="notif-panel-head">
        <strong>Notifications</strong>
        <button class="link-btn" id="notif-mark-all">Mark all read</button>
      </div>
      <div class="notif-list" id="notif-list">
        <div class="notif-empty">You're all caught up.</div>
      </div>
    </div>`;

  const oldBell = Array.from(actions.querySelectorAll('.icon-btn-round')).find((el) =>
    el.querySelector('.fa-bell')
  );
  if (oldBell) {
    actions.replaceChild(wrap, oldBell);
  } else {
    actions.appendChild(wrap);
  }

  document.getElementById('notif-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notif-panel').classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notif-wrap')) document.getElementById('notif-panel')?.classList.remove('show');
  });
  document.getElementById('notif-mark-all').addEventListener('click', async () => {
    const profile = getStoredUser();
    if (!profile) return;
    await sb.from('notifications').update({ is_read: true }).eq('receiver_id', profile.user_id).eq('is_read', false);
    refreshNotifications(profile);
  });
}

async function refreshNotifications(profile) {
  if (!profile) return;
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .eq('receiver_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) return;

  const unread = (data || []).filter((n) => !n.is_read).length;
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';

  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="notif-empty">You're all caught up.</div>`;
    return;
  }
  list.innerHTML = data
    .map(
      (n) => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.notification_id}" data-link="${escapeHtml(n.link || '')}">
        <div class="notif-item-title">${escapeHtml(n.title || 'Notification')}</div>
        <div class="notif-item-msg">${escapeHtml(n.message || '')}</div>
        <div class="notif-item-time">${fmtTimeAgo(n.created_at)}</div>
      </div>`
    )
    .join('');

  list.querySelectorAll('.notif-item').forEach((item) => {
    item.addEventListener('click', async () => {
      await sb.from('notifications').update({ is_read: true }).eq('notification_id', item.dataset.id);
      const link = item.dataset.link;
      if (link && typeof navigateTo === 'function') navigateTo(link);
      refreshNotifications(profile);
    });
  });
}

function subscribeNotifRealtime(profile) {
  if (!profile || notifChannel) return;
  notifChannel = sb
    .channel('notifications-' + profile.user_id)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_id=eq.${profile.user_id}` },
      (payload) => {
        refreshNotifications(profile);
        pushBrowserNotification(payload.new.title || 'TaskMaster', payload.new.message || '');
        showToast(payload.new.title || 'New notification', 'success');
      }
    )
    .subscribe();
}
