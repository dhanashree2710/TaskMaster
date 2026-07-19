document.addEventListener('DOMContentLoaded', () => {
  redirectIfAuthed();

  const form = document.getElementById('forgot-form');
  const btn = document.getElementById('forgot-btn');
  const btnText = document.getElementById('forgot-btn-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();

    document.getElementById('field-email').classList.toggle('has-error', !email.includes('@'));
    if (!email.includes('@')) return;

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Checking...';

    try {
      const { data, error } = await sb
        .from('users')
        .select('user_name,user_email,status')
        .eq('user_email', email)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No account was found for that email.');

      form.style.display = 'none';
      document.getElementById('sent-confirmation').style.display = 'block';
    } catch (err) {
      showToast(friendlyAuthError(err), 'error');
      btn.disabled = false;
      btnText.textContent = 'Check account';
    }
  });
});
