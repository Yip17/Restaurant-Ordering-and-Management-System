// public/js/my-feedback.js
// Drives feedback/my-feedback.html

// Wraps fetchMethod in a Promise so async/await flow is preserved.
// Resolves with { status, data } — status is the HTTP code, data is the JSON body.
function apiFetch(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve({ status, data }), method, body);
  });
}

let editModal;

document.addEventListener('DOMContentLoaded', async () => {
  editModal = new bootstrap.Modal(document.getElementById('editModal'));

  const { data: auth } = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    document.getElementById('nav-username').textContent = `Welcome, ${auth.user.name}`;
  }

  await loadMyFeedback();
  document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);
});

// ── Load & render ─────────────────────────────────────────────────────────
async function loadMyFeedback() {
  const loading    = document.getElementById('loading');
  const noFeedback = document.getElementById('no-feedback');
  const tableWrap  = document.getElementById('table-container');
  const tbody      = document.getElementById('feedback-tbody');

  loading.style.display    = 'block';
  noFeedback.style.display = 'none';
  tableWrap.style.display  = 'none';
  tbody.innerHTML          = '';

  const { data } = await apiFetch('/feedback/my');
  loading.style.display = 'none';

  if (!data.success) {
    showGlobalAlert('danger', data.message || 'Failed to load feedback.');
    return;
  }

  if (!data.feedback || data.feedback.length === 0) {
    noFeedback.style.display = 'block';
    return;
  }

  data.feedback.forEach((fb, idx) => {
    tbody.insertAdjacentHTML('beforeend', buildRow(fb, idx + 1));
  });

  tableWrap.style.display = 'block';
}

function buildRow(fb, rowNum) {
  const stars     = renderStars(fb.rating);
  const submitted = new Date(fb.created_at).toLocaleDateString();
  const edited    = fb.updated_at
                      ? new Date(fb.updated_at).toLocaleDateString()
                      : '<span class="text-muted">—</span>';

  return `
    <tr id="row-${fb.feedback_id}">
      <td>${rowNum}</td>
      <td>
        <a href="/feedback/${escapeHtml(String(fb.product_id))}" class="text-decoration-none">
          ${escapeHtml(fb.product_name || '—')}
        </a>
      </td>
      <td>${stars}</td>
      <td style="max-width:300px; word-break:break-word;">${escapeHtml(fb.comment || '')}</td>
      <td>${submitted}</td>
      <td>${edited}</td>
      <td>
        <div class="d-flex gap-1 flex-wrap">
          <button class="btn btn-outline-primary btn-sm"
                  data-id="${fb.feedback_id}"
                  data-rating="${fb.rating}"
                  data-comment="${escapeHtml(fb.comment || '')}"
                  onclick="openEditModal(this)">Edit</button>
          <button class="btn btn-outline-danger btn-sm"
                  onclick="deleteFeedback(${fb.feedback_id})">Delete</button>
        </div>
      </td>
    </tr>`;
}

// ── Edit modal ────────────────────────────────────────────────────────────
function openEditModal(btn) {
  document.getElementById('edit-feedback-id').value = btn.dataset.id;
  document.getElementById('edit-rating').value      = btn.dataset.rating;
  document.getElementById('edit-comment').value     = btn.dataset.comment;
  document.getElementById('modal-error').style.display = 'none';
  document.getElementById('modal-error').textContent   = '';

  const saveBtn = document.getElementById('edit-save-btn');
  saveBtn.disabled    = false;
  saveBtn.textContent = 'Save Changes';
  editModal.show();
}

async function handleEditSubmit(e) {
  e.preventDefault();

  const feedbackId = document.getElementById('edit-feedback-id').value;
  const rating     = parseInt(document.getElementById('edit-rating').value, 10);
  const comment    = document.getElementById('edit-comment').value.trim();
  const modalErr   = document.getElementById('modal-error');
  const saveBtn    = document.getElementById('edit-save-btn');

  if (!rating)  { modalErr.textContent = 'Please select a rating.';  modalErr.style.display = 'block'; return; }
  if (!comment) { modalErr.textContent = 'Comment cannot be empty.'; modalErr.style.display = 'block'; return; }

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';
  modalErr.style.display = 'none';

  const { data } = await apiFetch(`/feedback/${feedbackId}`, 'PUT', { rating, comment });

  if (data.success) {
    editModal.hide();
    showGlobalAlert('success', 'Feedback updated successfully.');
    await loadMyFeedback();
  } else {
    modalErr.textContent   = data.message || 'Failed to update feedback.';
    modalErr.style.display = 'block';
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Changes';
  }
}

// ── Delete ────────────────────────────────────────────────────────────────
async function deleteFeedback(feedbackId) {
  if (!confirm('Delete this feedback?\nAll responses to it will also be removed.')) return;

  const { data } = await apiFetch(`/feedback/${feedbackId}`, 'DELETE');

  if (data.success) {
    const row = document.getElementById(`row-${feedbackId}`);
    if (row) row.remove();

    const tbody = document.getElementById('feedback-tbody');
    if (!tbody.querySelector('tr')) {
      document.getElementById('table-container').style.display = 'none';
      document.getElementById('no-feedback').style.display     = 'block';
    }
    showGlobalAlert('success', 'Feedback deleted successfully.');
  } else {
    showGlobalAlert('danger', data.message || 'Failed to delete feedback.');
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────
function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${i <= rating ? 'text-warning' : 'text-muted'}" style="font-size:1rem;">★</span>`;
  }
  return `${html} <small class="text-muted">(${rating}/5)</small>`;
}

function showGlobalAlert(type, message) {
  const el = document.getElementById('global-alert');
  el.className     = `alert alert-${type} alert-dismissible fade show`;
  el.innerHTML     = `${escapeHtml(message)}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
