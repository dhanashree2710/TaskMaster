// ===========================================
// User-table session helpers
// ===========================================
// This app uses only the public.users table for login and managed registration.
// A successful login stores the current user in localStorage.

const ROLE_LABELS = {
  'Super Admin': { icon: 'fa-crown', canManageTeam: true, isAdmin: true },
  'Admin': { icon: 'fa-user-shield', canManageTeam: true, isAdmin: true },
  'Manager': { icon: 'fa-user-tie', canManageTeam: true, isAdmin: false },
  'Employee': { icon: 'fa-user', canManageTeam: false, isAdmin: false },
  'Intern': { icon: 'fa-user-graduate', canManageTeam: false, isAdmin: false },
};

async function signUpUser({ name, email, password, role }) {
  const { data: existing, error: lookupError } = await sb
    .from('users')
    .select('user_id')
    .eq('user_email', email)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) throw new Error('An account with this email already exists.');

  const { data, error } = await sb
    .from('users')
    .insert({
      user_name: name,
      user_email: email,
      user_password: password,
      role,
      status: 'Active',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function signInUser({ email, password }) {
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('user_email', email)
    .eq('user_password', password)
    .single();

  if (error || !data) throw new Error('Invalid email or password.');
  if (data.status !== 'Active') throw new Error('Your account is inactive.');

  await sb.from('users').update({ last_login: new Date().toISOString() }).eq('user_id', data.user_id);
  localStorage.setItem('user', JSON.stringify(data));
  return data;
}

async function signOutUser() {
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

async function fetchProfile(userId) {
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function requireAuth() {
  const profile = getStoredUser();
  if (!profile) {
    window.location.href = 'index.html';
    return null;
  }
  return { profile };
}

function redirectIfAuthed() {
  if (getStoredUser()) window.location.href = 'dashboard.html';
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    localStorage.removeItem('user');
    return null;
  }
}

function canRegisterUsers(profile) {
  return ['Super Admin', 'Admin', 'Manager'].includes(profile?.role);
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
}

function friendlyAuthError(error) {
  const msg = error?.message || 'Something went wrong. Please try again.';
  if (msg.toLowerCase().includes('invalid login credentials')) return 'Incorrect email or password.';
  if (msg.toLowerCase().includes('invalid email or password')) return 'Incorrect email or password.';
  if (msg.toLowerCase().includes('duplicate key')) return 'An account with this email already exists.';
  if (msg.toLowerCase().includes('user already registered')) return 'An account with this email already exists.';
  return msg;
}
