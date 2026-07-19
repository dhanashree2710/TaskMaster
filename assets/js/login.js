document.addEventListener('DOMContentLoaded', () => {
  redirectIfAuthed();

  const bioBtn = document.getElementById('biometric-login-btn');
  if (bioBtn && getLocalBiometric() && isWebAuthnSupported()) {
    bioBtn.style.display = '';
    bioBtn.addEventListener('click', () => loginWithBiometric());
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

  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-btn');
  const btnText = document.getElementById('login-btn-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    let valid = true;
    document.getElementById('field-email').classList.toggle('has-error', !email.includes('@'));
    if (!email.includes('@')) valid = false;
    document.getElementById('field-password').classList.toggle('has-error', password.length < 1);
    if (password.length < 1) valid = false;
    if (!valid) return;

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Signing in...';

    try {
      await signInUser({ email, password });
      window.location.href = 'dashboard.html';
    } catch (err) {
      showToast(friendlyAuthError(err), 'error');
      btn.disabled = false;
      btnText.textContent = 'Sign in';
    }
  });
});
