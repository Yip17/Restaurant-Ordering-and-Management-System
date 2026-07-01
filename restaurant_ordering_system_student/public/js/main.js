// public/js/main.js

/* =========================
   UTILITIES
   ========================= */

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

function createStarRating(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<span class="${i <= rating ? 'text-warning' : 'text-muted'}">★</span>`;
  }
  return stars + `<small class="text-muted">(${rating}/5)</small>`;
}

/* =========================
   LOGIN LOGIC
   ========================= */
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) return;

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errEl    = document.getElementById('error-message');

    fetchMethod('/login', (status, data) => {
      if (data.success && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        if (errEl) {
          errEl.textContent   = data.message || 'Login failed.';
          errEl.style.display = 'block';
        } else {
          alert(data.message || 'Login failed.');
        }
      }
    }, 'POST', { email, password });
  });
});
