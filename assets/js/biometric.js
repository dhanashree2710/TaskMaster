// ===========================================
// Biometric login (WebAuthn platform authenticator)
// ===========================================
// This binds a WebAuthn credential to the device's fingerprint/Face ID
// sensor and stores the credential id both locally and in Supabase.
// Note: because this is a static site with no backend, the signed
// assertion is not cryptographically verified server-side - matching
// credential ids after a successful OS biometric prompt is treated as
// proof of presence. For a production deployment, verify the WebAuthn
// assertion signature on a server before trusting it.

const BIOMETRIC_LOCAL_KEY = 'tm_biometric_credential';

function isWebAuthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}

function b64urlEncode(buffer) {
  let binary = '';
  new Uint8Array(buffer).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function getLocalBiometric() {
  try {
    return JSON.parse(localStorage.getItem(BIOMETRIC_LOCAL_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

// Supabase/PostgREST returns this when a table hasn't been created yet
// (or was created after the schema cache was last refreshed). Surface a
// message that actually tells the person how to fix it instead of a raw
// Postgres error.
function isMissingBiometricTableError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return error.code === 'PGRST205' || msg.includes('user_biometric_credentials');
}

function biometricSetupNeededMessage() {
  return "Biometric sign-in isn't set up on the server yet. Ask an admin to run supabase/fix_biometric_table.sql in the Supabase SQL editor.";
}

async function enrollBiometric(profile) {
  if (!isWebAuthnSupported()) {
    showToast('Biometric login is not supported on this device/browser.', 'error');
    return;
  }
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'TaskMaster', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(profile.user_id),
          name: profile.user_email,
          displayName: profile.user_name,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
        attestation: 'none',
      },
    });
    if (!credential) throw new Error('Could not create a biometric credential.');

    const credentialId = b64urlEncode(credential.rawId);
    const { error } = await sb
      .from('user_biometric_credentials')
      .insert({ user_id: profile.user_id, credential_id: credentialId, device_label: navigator.userAgent.slice(0, 80) });
    if (error) throw new Error(isMissingBiometricTableError(error) ? biometricSetupNeededMessage() : error.message);

    localStorage.setItem(BIOMETRIC_LOCAL_KEY, JSON.stringify({ credentialId, email: profile.user_email }));
    showToast('Biometric sign-in enabled on this device.', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not enable biometric login.', 'error');
  }
}

async function disableBiometric() {
  const local = getLocalBiometric();
  if (local) {
    await sb.from('user_biometric_credentials').delete().eq('credential_id', local.credentialId).catch(() => {});
  }
  localStorage.removeItem(BIOMETRIC_LOCAL_KEY);
  showToast('Biometric login removed from this device.', 'success');
}

async function loginWithBiometric() {
  const local = getLocalBiometric();
  if (!local) {
    showToast('No biometric login set up on this device yet.', 'error');
    return;
  }
  if (!isWebAuthnSupported()) {
    showToast('Biometric login is not supported on this device/browser.', 'error');
    return;
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: b64urlDecode(local.credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    if (!assertion) throw new Error('Biometric verification failed.');

    const { data: cred, error } = await sb
      .from('user_biometric_credentials')
      .select('*, person:users(*)')
      .eq('credential_id', local.credentialId)
      .maybeSingle();
    if (error && isMissingBiometricTableError(error)) throw new Error(biometricSetupNeededMessage());
    if (error || !cred || !cred.person) throw new Error('This biometric credential is no longer registered. Sign in with your password and re-enable it in Settings.');
    if (cred.person.status !== 'Active') throw new Error('Your account is inactive.');

    await sb.from('users').update({ last_login: new Date().toISOString() }).eq('user_id', cred.person.user_id);
    localStorage.setItem('user', JSON.stringify(cred.person));
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Biometric sign-in failed.', 'error');
  }
}
