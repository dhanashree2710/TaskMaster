// ===========================================
// Shared photo upload / camera capture widget
// Used by Register, Employees, Interns, and Settings.
// Uploads go straight into Supabase Storage buckets
// (employee_photos / intern_photos, see STORAGE_BUCKETS).
// ===========================================

async function uploadPhotoToBucket(bucket, file, folder = 'uploads') {
  const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Renders the widget markup. `id` becomes the hidden input holding the
// resulting public URL, so existing code that reads `document.getElementById(id).value`
// keeps working unchanged.
function renderPhotoField(id, opts = {}) {
  const label = opts.label || 'Photo';
  const url = opts.url || '';
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <div class="photo-field" id="${id}-widget">
        <div class="photo-preview" id="${id}-preview">
          ${url ? `<img src="${escapeHtml(url)}" alt="" />` : `<i class="fa-solid fa-user"></i>`}
        </div>
        <div class="photo-field-actions">
          <input type="file" accept="image/*" id="${id}-file" hidden />
          <button type="button" class="btn-sm-ghost" id="${id}-upload-btn"><i class="fa-solid fa-upload"></i> Upload</button>
          <button type="button" class="btn-sm-ghost" id="${id}-camera-btn"><i class="fa-solid fa-camera"></i> Take photo</button>
          <button type="button" class="btn-sm-ghost" id="${id}-remove-btn" style="${url ? '' : 'display:none;'}"><i class="fa-solid fa-trash"></i></button>
        </div>
        <span class="photo-field-status" id="${id}-status"></span>
      </div>
      <input type="hidden" id="${id}" value="${escapeHtml(url)}" />
    </div>`;
}

// bucketResolver can be a bucket name string, or a function returning one
// (useful when the bucket depends on a role picker that can change).
function wirePhotoField(id, bucketResolver) {
  const fileInput = document.getElementById(`${id}-file`);
  const uploadBtn = document.getElementById(`${id}-upload-btn`);
  const cameraBtn = document.getElementById(`${id}-camera-btn`);
  const removeBtn = document.getElementById(`${id}-remove-btn`);
  const preview = document.getElementById(`${id}-preview`);
  const status = document.getElementById(`${id}-status`);
  const hidden = document.getElementById(id);
  if (!fileInput || !hidden) return;

  const setPreview = (url) => {
    hidden.value = url || '';
    preview.innerHTML = url ? `<img src="${url}" alt="" />` : `<i class="fa-solid fa-user"></i>`;
    if (removeBtn) removeBtn.style.display = url ? '' : 'none';
  };

  const doUpload = async (file) => {
    const bucket = typeof bucketResolver === 'function' ? bucketResolver() : bucketResolver;
    if (!bucket) return showToast('Pick a role before adding a photo.', 'error');
    if (status) status.textContent = 'Uploading...';
    try {
      const url = await uploadPhotoToBucket(bucket, file);
      setPreview(url);
      if (status) {
        status.textContent = 'Uploaded.';
        setTimeout(() => (status.textContent = ''), 2000);
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = '';
      showToast(err.message || 'Photo upload failed.', 'error');
    }
  };

  uploadBtn?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) doUpload(file);
    fileInput.value = '';
  });
  removeBtn?.addEventListener('click', () => setPreview(''));
  cameraBtn?.addEventListener('click', () => openCameraCapture((file) => doUpload(file)));
}

// ---------- Live camera capture modal ----------
function openCameraCapture(onCapture) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Camera access is not available on this device/browser.', 'error');
    return;
  }
  const root = document.getElementById('modal-root');
  if (!root) return;

  const html = `
    <div class="tm-modal-backdrop show" id="modal-camera-capture">
      <div class="tm-modal">
        <div class="tm-modal-head"><h3>Take a photo</h3><button class="tm-modal-close" id="camera-close">&times;</button></div>
        <div class="camera-frame"><video id="camera-video" autoplay playsinline muted></video></div>
        <canvas id="camera-canvas" style="display:none;"></canvas>
        <div class="tm-modal-actions">
          <button class="btn-sm-ghost" id="camera-cancel">Cancel</button>
          <button class="btn-sm-gradient" id="camera-shoot"><i class="fa-solid fa-camera"></i> Capture</button>
        </div>
      </div>
    </div>`;
  root.insertAdjacentHTML('beforeend', html);

  const modal = document.getElementById('modal-camera-capture');
  const video = document.getElementById('camera-video');
  let stream = null;

  const stopStream = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  const close = () => {
    stopStream();
    modal.remove();
  };

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user' }, audio: false })
    .then((s) => {
      stream = s;
      video.srcObject = s;
    })
    .catch((err) => {
      console.error(err);
      showToast('Could not access the camera.', 'error');
      close();
    });

  document.getElementById('camera-close').addEventListener('click', close);
  document.getElementById('camera-cancel').addEventListener('click', close);
  document.getElementById('camera-shoot').addEventListener('click', () => {
    const canvas = document.getElementById('camera-canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        close();
      },
      'image/jpeg',
      0.9
    );
  });
}
