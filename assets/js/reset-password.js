document.addEventListener('DOMContentLoaded', () => {
  const backLink = document.getElementById('back-to-login');
  if (backLink) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'index.html';
    });
  }
});
