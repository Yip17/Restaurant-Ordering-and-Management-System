// public/js/register.js
// Drives register.html — member registration form

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const errEl     = document.getElementById('error-message');
  const successEl = document.getElementById('success-message');
  const btn       = document.getElementById('submit-btn');

  errEl.style.display     = 'none';
  successEl.style.display = 'none';

  const username  = document.getElementById('username').value.trim();
  const firstName = document.getElementById('first_name').value.trim();
  const lastName  = document.getElementById('last_name').value.trim();
  const email     = document.getElementById('email').value.trim();
  const password  = document.getElementById('password').value;
  const confirm   = document.getElementById('confirm_password').value;

  if (!username || username.length < 3) { showError('Username must be at least 3 characters.'); return; }
  if (!firstName || !lastName)          { showError('First name and last name are required.'); return; }
  if (!email)                           { showError('Email is required.'); return; }
  if (password.length < 8)             { showError('Password must be at least 8 characters.'); return; }
  if (password !== confirm) {
    showError('Passwords do not match.');
    document.getElementById('confirm_password').classList.add('is-invalid');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creating account…';

  try {
    const res    = await fetch('/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, first_name: firstName, last_name: lastName, email, password })
    });
    const result = await res.json();

    if (result.success) {
      successEl.textContent   = 'Registration successful! Redirecting…';
      successEl.style.display = 'block';
      setTimeout(() => { window.location.href = result.redirectUrl; }, 800);
    } else {
      showError(result.message || 'Registration failed. Please try again.');
      btn.disabled    = false;
      btn.textContent = 'Create Account';
    }
  } catch (_) {
    showError('An error occurred. Please try again.');
    btn.disabled    = false;
    btn.textContent = 'Create Account';
  }
});

function showError(msg) {
  const el = document.getElementById('error-message');
  el.textContent   = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
