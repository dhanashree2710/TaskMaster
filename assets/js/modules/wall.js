// ===========================================
// Wall module (social feed)
// ===========================================
let WALL_CACHE = [];
const WALL_LIKED = new Set(JSON.parse(localStorage.getItem('wall_liked') || '[]'));

function renderWallSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">Culture</span>
        <h2>Wall</h2>
        <p>Share wins, updates, and announcements with the team.</p>
      </div>
    </div>

    <div class="glass-card wall-composer">
      <textarea id="wall-composer-text" placeholder="Share something with the team..."></textarea>
      <div class="wall-composer-photo" id="wall-composer-preview-wrap" style="display:none;">
        <img id="wall-composer-preview-img" alt="" />
        <button type="button" class="icon-btn-sm danger" id="wall-composer-photo-remove" title="Remove photo"><i class="fa-solid fa-trash"></i></button>
      </div>
      <input type="hidden" id="wall-composer-image" value="" />
      <div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <input type="file" accept="image/*" id="wall-composer-file" hidden />
          <button type="button" class="btn-sm-ghost" id="wall-composer-upload-btn"><i class="fa-solid fa-image"></i> Add photo</button>
          <button type="button" class="btn-sm-ghost" id="wall-composer-camera-btn"><i class="fa-solid fa-camera"></i> Take photo</button>
          <div class="wall-visibility" id="wall-visibility-wrap">
            <button type="button" class="btn-sm-ghost" id="wall-visibility-btn"><i class="fa-solid fa-eye"></i> <span id="wall-visibility-label">Everyone</span> <i class="fa-solid fa-caret-down"></i></button>
            <div class="wall-visibility-menu" id="wall-visibility-menu">
              <label class="wv-row"><input type="checkbox" id="wv-all" checked /> Everyone</label>
              <hr />
              <label class="wv-row"><input type="checkbox" class="wv-role" value="Super Admin" /> Super Admin</label>
              <label class="wv-row"><input type="checkbox" class="wv-role" value="Admin" /> Admin</label>
              <label class="wv-row"><input type="checkbox" class="wv-role" value="Manager" /> Manager</label>
              <label class="wv-row"><input type="checkbox" class="wv-role" value="Employee" /> Employee</label>
              <label class="wv-row"><input type="checkbox" class="wv-role" value="Intern" /> Intern</label>
            </div>
          </div>
          <span class="photo-field-status" id="wall-composer-photo-status"></span>
        </div>
        <button class="btn-gradient" id="wall-post-btn"><i class="fa-solid fa-paper-plane"></i> Post</button>
      </div>
    </div>

    <div class="filter-bar">
      <select class="form-select-tm" id="wall-filter-scope"><option value="all">Everyone's posts</option><option value="mine">My posts</option></select>
      <span class="filter-count" id="wall-filter-count"></span>
    </div>

    <div id="wall-feed"></div>
  `;
}

async function initWall(profile) {
  document.getElementById('wall-post-btn').addEventListener('click', () => submitPost(profile));
  document.getElementById('wall-filter-scope').addEventListener('change', renderWallFeed);
  wireWallComposerPhoto();
  wireWallVisibility();
  await loadWall(profile);
}

// ---------- Composer: "who can see this post" control ----------
const ALL_ROLES = ['Super Admin', 'Admin', 'Manager', 'Employee', 'Intern'];

function wireWallVisibility() {
  const btn = document.getElementById('wall-visibility-btn');
  const menu = document.getElementById('wall-visibility-menu');
  const label = document.getElementById('wall-visibility-label');
  const allBox = document.getElementById('wv-all');
  const roleBoxes = [...document.querySelectorAll('.wv-role')];

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('show');
  });

  const updateLabel = () => {
    const checked = roleBoxes.filter((b) => b.checked).map((b) => b.value);
    if (allBox.checked || !checked.length) {
      label.textContent = 'Everyone';
    } else if (checked.length === 1) {
      label.textContent = checked[0];
    } else {
      label.textContent = `${checked.length} roles`;
    }
  };

  allBox.addEventListener('change', () => {
    if (allBox.checked) {
      roleBoxes.forEach((b) => { b.checked = false; });
    }
    updateLabel();
  });

  roleBoxes.forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) allBox.checked = false;
      if (!roleBoxes.some((b) => b.checked)) allBox.checked = true;
      updateLabel();
    });
  });
}

function getSelectedWallVisibility() {
  const allBox = document.getElementById('wv-all');
  const roleBoxes = [...document.querySelectorAll('.wv-role')];
  const checked = roleBoxes.filter((b) => b.checked).map((b) => b.value);
  return allBox.checked || !checked.length ? null : checked;
}

function resetWallVisibility() {
  document.getElementById('wv-all').checked = true;
  document.querySelectorAll('.wv-role').forEach((b) => { b.checked = false; });
  document.getElementById('wall-visibility-label').textContent = 'Everyone';
  document.getElementById('wall-visibility-menu').classList.remove('show');
}

function wireWallComposerPhoto() {
  const fileInput = document.getElementById('wall-composer-file');
  const hidden = document.getElementById('wall-composer-image');
  const previewWrap = document.getElementById('wall-composer-preview-wrap');
  const previewImg = document.getElementById('wall-composer-preview-img');
  const status = document.getElementById('wall-composer-photo-status');

  const setPreview = (url) => {
    hidden.value = url || '';
    previewImg.src = url || '';
    previewWrap.style.display = url ? '' : 'none';
  };

  const doUpload = async (file) => {
    status.textContent = 'Uploading...';
    try {
      const url = await uploadPhotoToBucket(STORAGE_BUCKETS.wallImages, file);
      setPreview(url);
      status.textContent = 'Uploaded.';
      setTimeout(() => (status.textContent = ''), 2000);
    } catch (err) {
      console.error(err);
      status.textContent = '';
      showToast(err.message || 'Photo upload failed.', 'error');
    }
  };

  document.getElementById('wall-composer-upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) doUpload(file);
    fileInput.value = '';
  });
  document.getElementById('wall-composer-camera-btn').addEventListener('click', () => openCameraCapture((file) => doUpload(file)));
  document.getElementById('wall-composer-photo-remove').addEventListener('click', () => setPreview(''));
}

async function loadWall(profile) {
  const { data, error } = await sb
    .from('posts')
    .select('*, author:users(user_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error(error);
    return;
  }
  WALL_CACHE = data || [];
  renderWallFeed();
}

function renderWallFeed() {
  const profile = getStoredUser();
  const roleMeta = ROLE_LABELS[profile.role] || ROLE_LABELS.Employee;
  const scope = document.getElementById('wall-filter-scope')?.value || 'all';

  const visibleToMe = WALL_CACHE.filter((p) => {
    if (roleMeta.isAdmin) return true; // admins can see & moderate every post
    if (p.user_id === profile.user_id) return true; // always see your own posts
    if (!p.visible_roles || !p.visible_roles.length) return true; // unrestricted
    return p.visible_roles.includes(profile.role);
  });

  const rows = scope === 'mine' ? visibleToMe.filter((p) => p.user_id === profile.user_id) : visibleToMe;
  document.getElementById('wall-filter-count').textContent = `${rows.length} post${rows.length === 1 ? '' : 's'}`;

  const feed = document.getElementById('wall-feed');
  if (!rows.length) {
    feed.innerHTML = `<div class="glass-card activity-card"><i class="fa-solid fa-layer-group"></i><p>No posts yet. Be the first to share something.</p></div>`;
    return;
  }

  feed.innerHTML = rows
    .map(
      (p) => `
    <div class="glass-card wall-post" data-post="${p.post_id}">
      <div class="wall-post-head">
        <div class="avatar">${getInitials(p.author?.user_name)}</div>
        <div><div class="p-name">${escapeHtml(p.author?.user_name || 'Someone')}</div><div class="p-time">${fmtTimeAgo(p.created_at)}</div></div>
        ${p.visible_roles && p.visible_roles.length ? `<span class="badge-soft info wall-visibility-badge" title="Only visible to: ${escapeHtml(p.visible_roles.join(', '))}"><i class="fa-solid fa-eye"></i> ${escapeHtml(p.visible_roles.length === 1 ? p.visible_roles[0] : p.visible_roles.length + ' roles')}</span>` : ''}
      </div>
      <div class="wall-post-body">${escapeHtml(p.content || '')}</div>
      ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" class="wall-post-img" alt="" />` : ''}
      <div class="wall-post-actions">
        <button class="wall-action-btn ${WALL_LIKED.has(p.post_id) ? 'liked' : ''}" data-like="${p.post_id}"><i class="fa-solid fa-heart"></i> <span data-like-count>${p.likes || 0}</span></button>
        <button class="wall-action-btn" data-toggle-comments="${p.post_id}"><i class="fa-regular fa-comment"></i> ${p.comments || 0} comments</button>
      </div>
      <div class="wall-comments" id="comments-${p.post_id}">
        <div class="comment-list" id="comment-list-${p.post_id}"></div>
        <div class="wall-comment-input">
          <input type="text" placeholder="Write a comment..." id="comment-input-${p.post_id}" />
          <button class="btn-sm-ghost" data-send-comment="${p.post_id}">Send</button>
        </div>
      </div>
    </div>`
    )
    .join('');

  feed.querySelectorAll('[data-like]').forEach((btn) => btn.addEventListener('click', () => toggleLike(btn.dataset.like)));
  feed.querySelectorAll('[data-toggle-comments]').forEach((btn) => btn.addEventListener('click', () => toggleComments(btn.dataset.toggleComments)));
  feed.querySelectorAll('[data-send-comment]').forEach((btn) => btn.addEventListener('click', () => sendComment(btn.dataset.sendComment)));
}

async function submitPost(profile) {
  const content = document.getElementById('wall-composer-text').value.trim();
  const image_url = document.getElementById('wall-composer-image').value.trim();
  if (!content && !image_url) return showToast('Write something to post.', 'error');

  const visible_roles = getSelectedWallVisibility();
  const { error } = await sb.from('posts').insert({ user_id: profile.user_id, content, image_url: image_url || null, visible_roles });
  if (error) return showToast(error.message, 'error');

  document.getElementById('wall-composer-text').value = '';
  document.getElementById('wall-composer-image').value = '';
  document.getElementById('wall-composer-preview-wrap').style.display = 'none';
  document.getElementById('wall-composer-preview-img').src = '';
  resetWallVisibility();
  await logActivity(profile.user_id, 'Posted on the wall');
  loadWall(profile);
}

async function toggleLike(postId) {
  const post = WALL_CACHE.find((p) => p.post_id === postId);
  if (!post) return;
  const alreadyLiked = WALL_LIKED.has(postId);
  const nextLikes = Math.max(0, (post.likes || 0) + (alreadyLiked ? -1 : 1));
  const { error } = await sb.from('posts').update({ likes: nextLikes }).eq('post_id', postId);
  if (error) return;
  post.likes = nextLikes;
  if (alreadyLiked) WALL_LIKED.delete(postId);
  else WALL_LIKED.add(postId);
  localStorage.setItem('wall_liked', JSON.stringify([...WALL_LIKED]));
  renderWallFeed();
}

async function toggleComments(postId) {
  const el = document.getElementById(`comments-${postId}`);
  el.classList.toggle('show');
  if (el.classList.contains('show')) {
    const { data } = await sb.from('comments').select('*, author:users(user_name)').eq('post_id', postId).order('created_at');
    document.getElementById(`comment-list-${postId}`).innerHTML = (data || [])
      .map((c) => `<div class="wall-comment"><span class="c-name">${escapeHtml(c.author?.user_name || 'Someone')}</span>${escapeHtml(c.comment)}</div>`)
      .join('') || `<p class="text-secondary" style="font-size:0.8rem;">No comments yet.</p>`;
  }
}

async function sendComment(postId) {
  const profile = getStoredUser();
  const input = document.getElementById(`comment-input-${postId}`);
  const comment = input.value.trim();
  if (!comment) return;
  const { error } = await sb.from('comments').insert({ post_id: postId, user_id: profile.user_id, comment });
  if (error) return showToast(error.message, 'error');

  const post = WALL_CACHE.find((p) => p.post_id === postId);
  const newCount = (post?.comments || 0) + 1;
  await sb.from('posts').update({ comments: newCount }).eq('post_id', postId);
  if (post) post.comments = newCount;

  if (post && post.user_id !== profile.user_id) {
    await notifyUsers([post.user_id], 'New comment', `${profile.user_name} commented on your post.`, 'page-wall');
  }

  input.value = '';
  renderWallFeed();
  const panel = document.getElementById(`comments-${postId}`);
  if (panel) {
    panel.classList.add('show');
    const { data } = await sb.from('comments').select('*, author:users(user_name)').eq('post_id', postId).order('created_at');
    document.getElementById(`comment-list-${postId}`).innerHTML = (data || [])
      .map((c) => `<div class="wall-comment"><span class="c-name">${escapeHtml(c.author?.user_name || 'Someone')}</span>${escapeHtml(c.comment)}</div>`)
      .join('');
  }
}
