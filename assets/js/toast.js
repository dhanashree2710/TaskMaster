function showToast(message, type = 'success') {
  const existing = document.querySelector('.tm-toast');
  if (existing) existing.remove();

  const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
  const iconColor = type === 'error' ? 'var(--danger)' : 'var(--success)';

  const toast = document.createElement('div');
  toast.className = `tm-toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icon}" style="color:${iconColor}; margin-top:2px;"></i>
    <span style="font-size:0.88rem;">${message}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
