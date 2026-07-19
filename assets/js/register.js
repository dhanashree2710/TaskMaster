document.addEventListener('DOMContentLoaded', async () => {
  const currentUser = getStoredUser();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  if (!canRegisterUsers(currentUser)) {
    showToast('Only Super Admin, Admin, and Manager users can register accounts.', 'error');
    setTimeout(() => (window.location.href = 'dashboard.html'), 900);
    return;
  }

  document.querySelectorAll('[data-toggle-for]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggleFor);
      const icon = btn.querySelector('i');
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });
  });

  const form = document.getElementById('register-form');
  const chips = document.querySelectorAll('#role-chips .chip');
  const roleInput = document.getElementById('selected-role');

  document.getElementById('photo-field-slot').innerHTML = renderPhotoField('photo-url', { label: 'Photo' });
  wirePhotoField('photo-url', () =>
    roleInput.value === 'Intern' ? STORAGE_BUCKETS.internPhotos : STORAGE_BUCKETS.employeePhotos
  );

  function applyRoleClass(role) {
    form.className = 'role-' + role.replace(/\s+/g, '-');
  }
  applyRoleClass(roleInput.value);

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      roleInput.value = chip.dataset.role;
      applyRoleClass(chip.dataset.role);
    });
  });

  await populateLookups();

  const btn = document.getElementById('register-btn');
  const btnText = document.getElementById('register-btn-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    const role = roleInput.value;

    let valid = true;
    toggleError('field-name', name.length === 0);
    if (name.length === 0) valid = false;
    toggleError('field-email', !email.includes('@'));
    if (!email.includes('@')) valid = false;
    toggleError('field-password', password.length < 6);
    if (password.length < 6) valid = false;
    toggleError('field-confirm', confirm !== password || confirm.length === 0);
    if (confirm !== password || confirm.length === 0) valid = false;
    if (!valid) return;

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating user...';

    try {
      const user = await signUpUser({ name, email, password, role });
      await createPeopleRecordForRole({ user, name, email, role });
      if (typeof notifyAdmins === 'function') {
        await notifyAdmins('New user registered', `${currentUser.user_name} registered ${name} as ${role}.`, 'page-admin').catch(() => {});
      }
      if (typeof logActivity === 'function') {
        await logActivity(currentUser.user_id, `Registered ${name} as ${role}`).catch(() => {});
      }
      showToast('Account created. You can register another user.', 'success');
      form.reset();
      document.getElementById('photo-field-slot').innerHTML = renderPhotoField('photo-url', { label: 'Photo' });
      wirePhotoField('photo-url', () =>
        roleInput.value === 'Intern' ? STORAGE_BUCKETS.internPhotos : STORAGE_BUCKETS.employeePhotos
      );
      chips.forEach((c) => c.classList.remove('active'));
      chips[0].classList.add('active');
      roleInput.value = chips[0].dataset.role;
      applyRoleClass(chips[0].dataset.role);
      btn.disabled = false;
      btnText.textContent = 'Create user';
    } catch (err) {
      showToast(friendlyAuthError(err), 'error');
      btn.disabled = false;
      btnText.textContent = 'Create user';
    }
  });

  function toggleError(fieldId, hasError) {
    document.getElementById(fieldId).classList.toggle('has-error', hasError);
  }
});

async function populateLookups() {
  const [departments, users] = await Promise.all([
    fetchDepartments().catch(() => []),
    sb
      .from("users")
      .select("user_id, user_name, role")
      .in("role", ["Super Admin", "Admin", "Manager", "Employee"])
      .then(r => r.data || [])
      .catch(() => []),
  ]);

  const deptOptions =
    '<option value="">None</option>' +
    departments.map(d =>
      `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`
    ).join("");

  const userOptions =
    '<option value="">None</option>' +
    users.map(u =>
      `<option value="${u.user_id}">${escapeHtml(u.user_name)} (${u.role})</option>`
    ).join("");

  document.getElementById("department").innerHTML = deptOptions;
  document.getElementById("int-department").innerHTML = deptOptions;

  document.getElementById("manager").innerHTML = userOptions;
  document.getElementById("mentor").innerHTML = userOptions;
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function numOrNull(id) {
  const v = val(id);
  return v === '' ? null : Number(v);
}
function dateOrNull(id) {
  const v = val(id);
  return v === '' ? null : v;
}
async function createPeopleRecordForRole({ user, name, email, role }) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.pop() || '';
  const middleName = rest.join(' ');
console.log("Selected Role:", role);
  // Intern
  if (role === 'Intern') {
    const internPayload = {
      user_id: user.user_id,
      photo_url: val('photo-url') || null,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName || null,
      gender: val('gender') || null,
      dob: dateOrNull('dob'),
      email,
      phone: val('phone') || null,
      college: val('college') || null,
      department_id: val('int-department') || null,
      guide: val('guide') || null,
      project: val('project') || null,
      duration: val('duration') || null,
      start_date: dateOrNull('start-date'),
      end_date: dateOrNull('end-date'),
      skills: val('skills') || null,
      certificate_url: val('certificate-url') || null,
      status: 'Active',
    };

    const { error } = await sb.from('interns').insert(internPayload);

    if (error) throw error;

    return;
  }

  // Employee / Manager / Admin / Super Admin
  const employeePayload = {
    user_id: user.user_id,
    employee_code: val('employee-code') || `EMP-${Date.now().toString().slice(-8)}`,
    photo_url: val('photo-url') || null,
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName || null,
    gender: val('gender') || null,
    dob: dateOrNull('dob'),
    blood_group: val('blood-group') || null,
    email,
    phone: val('phone') || null,
    alternate_phone: val('alt-phone') || null,
    department_id: val('department') || null,
    designation: val('designation') || role,
    joining_date: dateOrNull('joining-date') || new Date().toISOString().slice(0, 10),
    salary: numOrNull('salary'),
    address: val('address') || null,
    city: val('city') || null,
    state: val('state') || null,
    country: val('country') || null,
    pincode: val('pincode') || null,
    qualification: val('qualification') || null,
    experience: val('experience') || null,
    aadhar_no: val('aadhar') || null,
    pan_no: val('pan') || null,
    bank_name: val('bank-name') || null,
    account_number: val('account-number') || null,
    ifsc: val('ifsc') || null,
    status: 'Active',
  };

  const { error } = await sb.from('employees').insert(employeePayload);

  if (error) throw error;
}