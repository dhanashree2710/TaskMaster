// ===========================================
// Settings module
// ===========================================
function renderSettingsSection() {
  return `
    <div class="module-head">
      <div>
        <span class="section-kicker">You</span>
        <h2>Settings</h2>
        <p>Manage your profile, security, and notification preferences.</p>
      </div>
    </div>

    <div class="tm-tabs">
      <div class="tm-tab active" data-settings-tab="profile">Profile</div>
      <div class="tm-tab" data-settings-tab="security">Security</div>
      <div class="tm-tab" data-settings-tab="notifications">Notifications</div>
    </div>

    <div class="tm-tab-panel active" id="settings-panel-profile">
      <div class="glass-card" style="max-width:520px;">
        <div class="field"><label>Full name</label><input type="text" class="form-control-glass" style="padding-left:1rem;" id="st-name" /></div>
        <div class="field"><label>Email</label><input type="email" class="form-control-glass" style="padding-left:1rem;" id="st-email" disabled /></div>
        <div id="st-photo-slot"></div>
        <button class="btn-gradient" id="st-save-profile">Save profile</button>
      </div>
    </div>

    <div class="tm-tab-panel" id="settings-panel-security">
      <div class="glass-card" style="max-width:520px;">
        <div class="field"><label>New password</label><input type="password" class="form-control-glass" style="padding-left:1rem;" id="st-password" placeholder="At least 6 characters" /></div>
        <div class="field"><label>Confirm new password</label><input type="password" class="form-control-glass" style="padding-left:1rem;" id="st-password-confirm" /></div>
        <button class="btn-gradient" id="st-save-password">Update password</button>
      </div>

      <div class="glass-card mt-3" style="max-width:520px;">
        <h3 class="mb-2" style="font-size:1rem;">Biometric sign-in</h3>
        <p class="mb-3">Use your device's fingerprint or Face ID to sign in without a password. This is set up per device.</p>
        <div class="d-flex gap-2">
          <button class="btn-gradient" id="st-enable-biometric"><i class="fa-solid fa-fingerprint"></i> Enable on this device</button>
          <button class="btn-sm-ghost" id="st-disable-biometric">Remove from this device</button>
        </div>
        <p class="mt-2 mb-0 text-secondary" id="st-biometric-status" style="font-size:0.8rem;"></p>
      </div>
    </div>

    <div class="tm-tab-panel" id="settings-panel-notifications">
      <div class="glass-card" style="max-width:520px;">
        <p class="mb-3">Turn on phone/desktop alerts so you never miss a task, leave decision, or message. Add TaskMaster to your phone's home screen for the best experience.</p>
        <button class="btn-gradient" id="st-enable-notifs"><i class="fa-solid fa-bell"></i> Enable notifications</button>
        <p class="mt-3 mb-0 text-secondary" id="st-notif-status" style="font-size:0.82rem;"></p>
        <div class="field mt-3" style="max-width:220px;">
          <label>Theme</label>
          <button class="theme-toggle" data-theme-toggle></button>
        </div>
      </div>
    </div>
  `;
}

async function initSettings(profile) {
  document.querySelectorAll('[data-settings-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-settings-tab]').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('#page-settings .tm-tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`settings-panel-${tab.dataset.settingsTab}`).classList.add('active');
    });
  });

  document.getElementById('st-name').value = profile.user_name || '';
  document.getElementById('st-email').value = profile.user_email || '';

  // users has no photo column - the photo lives on the linked employees/interns
  // row, so read and write it there instead.
  const isIntern = profile.role === 'Intern';
  const personTable = isIntern ? 'interns' : 'employees';
  const bucket = isIntern ? STORAGE_BUCKETS.internPhotos : STORAGE_BUCKETS.employeePhotos;
  let currentPhotoUrl = '';
  let hasPersonRecord = false;
  try {
    const { data } = await sb.from(personTable).select('photo_url').eq('user_id', profile.user_id).maybeSingle();
    currentPhotoUrl = data?.photo_url || '';
    hasPersonRecord = !!data;
  } catch (e) { /* no linked record yet */ }

  document.getElementById('st-photo-slot').innerHTML = renderPhotoField('st-photo', { label: 'Photo', url: currentPhotoUrl });
  wirePhotoField('st-photo', bucket);

  document.getElementById('st-save-profile').addEventListener('click', async () => {
    const newName = document.getElementById('st-name').value.trim();
    const newPhoto = document.getElementById('st-photo').value.trim() || null;

    const { error } = await sb.from('users').update({ user_name: newName }).eq('user_id', profile.user_id);
    if (error) return showToast(error.message, 'error');

    let photoError = null;
    if (hasPersonRecord) {
      ({ error: photoError } = await sb.from(personTable).update({ photo_url: newPhoto }).eq('user_id', profile.user_id));
    } else {
      // No employees/interns row exists yet for this account (common for
      // Admin/Super Admin/Manager logins) — an UPDATE would silently match
      // zero rows and the photo would never actually save, so create the
      // row instead.
      ({ error: photoError } = await sb.from(personTable).insert({
        user_id: profile.user_id,
        first_name: newName,
        email: profile.user_email,
        photo_url: newPhoto,
      }));
      if (!photoError) hasPersonRecord = true;
    }
    if (photoError) console.warn('Could not update photo on linked profile record', photoError);

    const updated = { ...profile, user_name: newName };
    localStorage.setItem('user', JSON.stringify(updated));
    showToast('Profile updated.', 'success');
    renderUserChrome(updated);
    if (typeof applyChromeAvatar === 'function') applyChromeAvatar(updated);
  });

  document.getElementById('st-save-password').addEventListener('click', async () => {
    const pw = document.getElementById('st-password').value;
    const confirm = document.getElementById('st-password-confirm').value;
    if (pw.length < 6) return showToast('Password must be at least 6 characters.', 'error');
    if (pw !== confirm) return showToast('Passwords do not match.', 'error');
    const { error } = await sb.from('users').update({ user_password: pw }).eq('user_id', profile.user_id);
    if (error) return showToast(error.message, 'error');
    document.getElementById('st-password').value = '';
    document.getElementById('st-password-confirm').value = '';
    showToast('Password updated.', 'success');
  });

  document.querySelector('#page-settings [data-theme-toggle]')?.addEventListener('click', toggleTheme);

  document.getElementById('st-enable-notifs').addEventListener('click', async () => {
    const result = await requestNotificationPermission();
    showToast(result === 'granted' ? 'Notifications enabled.' : 'Notifications were not enabled.', result === 'granted' ? 'success' : 'error');
  });

  const bioStatus = document.getElementById('st-biometric-status');
  const refreshBioStatus = () => {
    const local = typeof getLocalBiometric === 'function' ? getLocalBiometric() : null;
    if (bioStatus) bioStatus.textContent = local ? 'Biometric sign-in is enabled on this device.' : 'Biometric sign-in is not set up on this device.';
  };
  refreshBioStatus();

  document.getElementById('st-enable-biometric')?.addEventListener('click', async () => {
    if (typeof enrollBiometric !== 'function') return showToast('Biometric login is unavailable.', 'error');
    await enrollBiometric(profile);
    refreshBioStatus();
  });
  document.getElementById('st-disable-biometric')?.addEventListener('click', async () => {
    if (typeof disableBiometric !== 'function') return;
    await disableBiometric();
    refreshBioStatus();
  });
}
