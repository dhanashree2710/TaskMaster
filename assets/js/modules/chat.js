// ===========================================
// Chat module
// ===========================================
let CHAT_ROOMS = [];
let CHAT_ACTIVE_ROOM = null;
let CHAT_CHANNEL = null;
let CHAT_POLL_INTERVAL = null;

function renderChatSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Talk</span>
        <h2>Chat</h2>
        <p>Direct messages and group rooms, synced live.</p>
      </div>
      <button class="btn-gradient" id="chat-new-room-btn"><i class="fa-solid fa-plus"></i> New room</button>
    </div>

    <div class="chat-shell">
      <div class="chat-rooms" id="chat-room-list"></div>
      <div class="chat-main">
        <div class="chat-main-head" id="chat-main-head">
          <span id="chat-main-title">Select a room</span>
          <button class="icon-btn-sm danger" id="chat-delete-room-btn" style="display:none;float:right;" title="Delete room"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="chat-messages" id="chat-messages"><div class="chat-empty">Pick a room to start chatting.</div></div>
        <div class="chat-input-row" id="chat-input-row" style="display:none;">
          <input type="text" id="chat-input" placeholder="Type a message..." />
          <button class="btn-sm-gradient" id="chat-send-btn">Send</button>
        </div>
      </div>
    </div>
  `;
}

async function initChat(profile) {
  document.getElementById('chat-new-room-btn').addEventListener('click', () => openNewRoomModal(profile));
  document.getElementById('chat-send-btn').addEventListener('click', () => sendMessage(profile));
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(profile);
  });
  await loadChatRooms(profile);
}

async function loadChatRooms(profile) {
  const { data: memberships, error } = await sb
    .from('chat_members')
    .select('room:chat_rooms(room_id, room_name, type, created_by)')
    .eq('user_id', profile.user_id);
  if (error) {
    console.error(error);
    return;
  }
  CHAT_ROOMS = (memberships || []).map((m) => m.room).filter(Boolean);
  renderRoomList();
}

function renderRoomList() {
  const list = document.getElementById('chat-room-list');
  if (!CHAT_ROOMS.length) {
    list.innerHTML = `<div class="notif-empty">No rooms yet. Create one to start chatting.</div>`;
    return;
  }
  list.innerHTML = CHAT_ROOMS.map(
    (r) => `
    <div class="chat-room-item ${CHAT_ACTIVE_ROOM === r.room_id ? 'active' : ''}" data-room="${r.room_id}">
      <div class="avatar" style="width:34px;height:34px;font-size:0.7rem;">${getInitials(r.room_name)}</div>
      <div><div class="r-name">${escapeHtml(r.room_name)}</div><div class="r-type">${escapeHtml(r.type || 'Group')}</div></div>
    </div>`
  ).join('');
  list.querySelectorAll('[data-room]').forEach((item) => item.addEventListener('click', () => openRoom(item.dataset.room)));
}

async function openRoom(roomId) {
  CHAT_ACTIVE_ROOM = roomId;
  renderRoomList();
  const profile = getStoredUser();
  const room = CHAT_ROOMS.find((r) => r.room_id === roomId);
  document.getElementById('chat-main-title').textContent = room?.room_name || 'Chat';
  document.getElementById('chat-input-row').style.display = 'flex';

  const deleteBtn = document.getElementById('chat-delete-room-btn');
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const canDeleteRoom = roleMeta.isAdmin || room?.created_by === profile.user_id;
  deleteBtn.style.display = canDeleteRoom ? '' : 'none';
  deleteBtn.onclick = () => deleteRoom(roomId);

  await loadMessages(roomId);

  if (CHAT_CHANNEL) sb.removeChannel(CHAT_CHANNEL);
  CHAT_CHANNEL = sb
    .channel('chat-' + roomId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, () => loadMessages(roomId))
    .subscribe();

  // Realtime relies on the project's Supabase realtime publication being
  // set up correctly. As a safety net so messages never require a manual
  // page refresh even if that's misconfigured, also poll while a room is
  // open, in addition to the realtime subscription above.
  if (CHAT_POLL_INTERVAL) clearInterval(CHAT_POLL_INTERVAL);
  CHAT_POLL_INTERVAL = setInterval(() => {
    if (CHAT_ACTIVE_ROOM === roomId && document.getElementById('page-chat')?.classList.contains('active')) {
      loadMessages(roomId);
    }
  }, 4000);
}

async function loadMessages(roomId) {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const { data, error } = await sb.from('messages').select('*, sender:users(user_name)').eq('room_id', roomId).order('created_at');
  if (error) return;
  const box = document.getElementById('chat-messages');
  box.innerHTML = (data || [])
    .map((m) => {
      const mine = m.sender_id === profile.user_id;
      const canDelete = mine || roleMeta.isAdmin;
      return `
    <div class="chat-bubble ${mine ? 'mine' : ''}" data-message="${m.message_id}">
      ${mine ? '' : `<div class="b-sender">${escapeHtml(m.sender?.user_name || '')}</div>`}
      ${escapeHtml(m.message)}
      <div class="b-time">${fmtTimeAgo(m.created_at)}${canDelete ? ` <button class="chat-msg-delete" data-delete-msg="${m.message_id}" title="Delete message"><i class="fa-solid fa-trash"></i></button>` : ''}</div>
    </div>`;
    })
    .join('') || `<div class="chat-empty">No messages yet. Say hello!</div>`;
  box.scrollTop = box.scrollHeight;

  box.querySelectorAll('[data-delete-msg]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(btn.dataset.deleteMsg, roomId);
    })
  );
}

async function deleteMessage(messageId, roomId) {
  if (!confirm('Delete this message?')) return;
  const { error } = await sb.from('messages').delete().eq('message_id', messageId);
  if (error) return showToast(error.message, 'error');
  loadMessages(roomId);
}

async function deleteRoom(roomId) {
  if (!confirm('Delete this chat room and all its messages? This cannot be undone.')) return;
  const { error } = await sb.from('chat_rooms').delete().eq('room_id', roomId);
  if (error) return showToast(error.message, 'error');

  if (CHAT_CHANNEL) { sb.removeChannel(CHAT_CHANNEL); CHAT_CHANNEL = null; }
  if (CHAT_POLL_INTERVAL) { clearInterval(CHAT_POLL_INTERVAL); CHAT_POLL_INTERVAL = null; }
  CHAT_ACTIVE_ROOM = null;

  document.getElementById('chat-main-title').textContent = 'Select a room';
  document.getElementById('chat-delete-room-btn').style.display = 'none';
  document.getElementById('chat-input-row').style.display = 'none';
  document.getElementById('chat-messages').innerHTML = '<div class="chat-empty">Pick a room to start chatting.</div>';

  showToast('Chat room deleted.', 'success');
  await loadChatRooms(getStoredUser());
}

async function sendMessage(profile) {
  if (!CHAT_ACTIVE_ROOM) return;
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';

  const { error } = await sb.from('messages').insert({ room_id: CHAT_ACTIVE_ROOM, sender_id: profile.user_id, message });
  if (error) return showToast(error.message, 'error');

  const { data: members } = await sb.from('chat_members').select('user_id').eq('room_id', CHAT_ACTIVE_ROOM).neq('user_id', profile.user_id);
  const room = CHAT_ROOMS.find((r) => r.room_id === CHAT_ACTIVE_ROOM);
  if (members?.length) {
    await notifyUsers(members.map((m) => m.user_id), room?.room_name || 'New message', `${profile.user_name}: ${message}`, 'page-chat');
  }
  loadMessages(CHAT_ACTIVE_ROOM);
}

async function openNewRoomModal(profile) {
  const users = (await fetchActiveUsers()).filter((u) => u.user_id !== profile.user_id);
  const html = `
    <div class="tm-modal-backdrop show" id="modal-chat-new">
      <div class="tm-modal">
        <div class="tm-modal-head"><h3>New chat room</h3><button class="tm-modal-close" data-close-modal="modal-chat-new">&times;</button></div>
        <div class="field"><label>Room name</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="cr-name" placeholder="Marketing team" /></div>
        <div class="field"><label>Add people</label>
          <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--r-md);padding:0.6rem;">
            ${users.map((u) => `<label class="checklist-item"><input type="checkbox" value="${u.user_id}" class="cr-member" /> ${escapeHtml(u.user_name)} <span class="text-secondary" style="font-size:0.75rem;">(${escapeHtml(u.role)})</span></label>`).join('') || '<p class="text-secondary">No other people yet.</p>'}
          </div>
        </div>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" data-close-modal="modal-chat-new">Cancel</button>
          <button class="btn-sm-gradient" id="cr-submit">Create room</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modal-root').innerHTML = html;

  document.getElementById('cr-submit').addEventListener('click', async () => {
    const name = document.getElementById('cr-name').value.trim();
    if (!name) return showToast('Give the room a name.', 'error');
    const memberIds = Array.from(document.querySelectorAll('.cr-member:checked')).map((cb) => cb.value);

    const { data: room, error } = await sb.from('chat_rooms').insert({
      room_name: name, type: memberIds.length > 1 ? 'Group' : 'Direct', created_by: profile.user_id,
    }).select().single();
    if (error) return showToast(error.message, 'error');

    const members = [profile.user_id, ...memberIds].map((user_id) => ({ room_id: room.room_id, user_id }));
    const { error: memberError } = await sb.from('chat_members').insert(members);
    if (memberError) return showToast(memberError.message, 'error');

    await notifyUsers(memberIds, 'Added to a chat room', `${profile.user_name} added you to "${name}"`, 'page-chat');
    showToast('Room created.', 'success');
    closeModal('modal-chat-new');
    await loadChatRooms(profile);
    openRoom(room.room_id);
  });
}
