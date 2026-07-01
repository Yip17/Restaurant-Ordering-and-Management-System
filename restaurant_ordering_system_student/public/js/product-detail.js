// public/js/product-detail.js
// Drives product-detail.html

// Wraps fetchMethod in a Promise so async/await flow is preserved.
// Resolves with { status, data } — status is the HTTP code, data is the JSON body.
function apiFetch(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve({ status, data }), method, body);
  });
}

let currentProductId = null;
let currentUserId    = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data: auth } = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    currentUserId = auth.user.id;
    document.getElementById('nav-username').textContent = `Welcome, ${auth.user.name}`;
  }
  await fetchProductDetail();
});

async function fetchProductDetail() {
  const params     = new URLSearchParams(window.location.search);
  currentProductId = params.get('id');
  const loading    = document.getElementById('loading');
  const errEl      = document.getElementById('error-message');
  const detail     = document.getElementById('product-detail');

  if (!currentProductId) {
    loading.style.display = 'none';
    errEl.style.display   = 'block';
    errEl.textContent     = 'No product specified.';
    return;
  }

  const { data } = await apiFetch(`/products/${currentProductId}`);
  loading.style.display = 'none';

  if (!data.success || !data.product) {
    errEl.style.display = 'block';
    return;
  }

  const p = data.product;
  document.title = `${p.name} - Restaurant`;
  document.getElementById('detail-name').textContent        = p.name;
  document.getElementById('detail-category').textContent    = p.category    || '—';
  document.getElementById('detail-description').textContent = p.description || '—';
  document.getElementById('detail-price').textContent       = `$${parseFloat(p.price).toFixed(2)}`;
  document.getElementById('detail-created-at').textContent  = new Date(p.created_at).toLocaleDateString();
  document.getElementById('detail-status').innerHTML = `
    <span class="badge ${p.is_available ? 'bg-success' : 'bg-secondary'}">
      ${p.is_available ? 'Available' : 'Unavailable'}
    </span>`;

  if (!p.is_available) {
    document.getElementById('order-card').style.display = 'none';
  }

  detail.style.display = 'block';
  document.getElementById('order-form').addEventListener('submit', handleOrderSubmit);
  await loadFeedbackSection();
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  const successEl = document.getElementById('order-success');
  const errorEl   = document.getElementById('order-error');
  const btn       = document.getElementById('order-btn');

  successEl.style.display = 'none';
  errorEl.style.display   = 'none';
  btn.disabled    = true;
  btn.textContent = 'Placing order…';

  const { status, data } = await apiFetch('/orders', 'POST', {
    product_id:       currentProductId,
    quantity:         parseInt(document.getElementById('quantity').value),
    delivery_address: document.getElementById('delivery-address').value.trim()
  });

  if (data.success) {
    successEl.innerHTML = `Order placed! Status: <strong>PACKING</strong>.
      <a href="/orders/my-orders" class="alert-link ms-2">View My Orders →</a>`;
    successEl.style.display = 'block';
    document.getElementById('order-form').reset();
  } else {
    errorEl.textContent   = data.message || 'Failed to place order.';
    errorEl.style.display = 'block';
  }

  btn.disabled    = false;
  btn.textContent = 'Order Now';
}

async function loadFeedbackSection() {
  await Promise.all([setupWriteFeedbackButton(), loadFeedbackList()]);
}

function setupWriteFeedbackButton() {
  const btn = document.getElementById('write-feedback-btn');
  const msg = document.getElementById('feedback-eligibility-msg');

  btn.href          = '/orders/my-orders';
  btn.textContent   = 'Write Feedback via My Orders';
  btn.style.display = '';

  if (msg) {
    msg.textContent   = 'To review a product, go to My Orders and click "Write Feedback" on a completed order.';
    msg.style.display = 'block';
  }
}

async function loadFeedbackList() {
  const fbLoading = document.getElementById('feedback-loading');
  const fbError   = document.getElementById('feedback-error');
  const noFb      = document.getElementById('no-feedback');
  const fbList    = document.getElementById('feedback-list');

  fbLoading.style.display = 'block';
  fbError.style.display   = 'none';
  noFb.style.display      = 'none';
  fbList.innerHTML        = '';

  const { data } = await apiFetch(`/feedback/${currentProductId}/all`);
  fbLoading.style.display = 'none';

  if (!data.success) {
    fbError.textContent   = data.message || 'Failed to load feedback.';
    fbError.style.display = 'block';
    return;
  }

  if (!data.feedback || data.feedback.length === 0) {
    noFb.style.display = 'block';
    return;
  }

  for (const fb of data.feedback) {
    const isOwner = currentUserId && Number(fb.member_id) === Number(currentUserId);
    fbList.appendChild(buildFeedbackCard(fb, isOwner));
    loadResponses(fb.feedback_id);
  }
}

function buildFeedbackCard(fb, isOwner) {
  const card = document.createElement('div');
  card.className = 'card mb-3';
  card.id = `feedback-card-${fb.feedback_id}`;

  card.innerHTML = `
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <span class="fw-semibold me-2">${escapeHtml(fb.username || 'Member')}</span>
          <span>${renderStars(fb.rating)}</span>
          <small class="text-muted ms-2">${new Date(fb.created_at).toLocaleString()}</small>
        </div>
        ${isOwner ? `
          <div class="d-flex gap-2">
            <a href="/feedback/${fb.feedback_id}/edit?productId=${currentProductId}"
               class="btn btn-outline-primary btn-sm">Edit</a>
            <button class="btn btn-outline-danger btn-sm"
                    onclick="deleteFeedback(${fb.feedback_id})">Delete</button>
          </div>` : ''}
      </div>
      <p class="mt-2 mb-2">
        ${fb.comment ? escapeHtml(fb.comment) : '<em class="text-muted">No comment.</em>'}
      </p>
      <div id="responses-${fb.feedback_id}" class="ms-3 mt-2 border-start ps-3">
        <small class="text-muted">Loading responses…</small>
      </div>
      ${!isOwner ? `
        <div class="mt-2">
          <div class="input-group input-group-sm">
            <input type="text" class="form-control"
                   id="response-input-${fb.feedback_id}"
                   placeholder="Write a response…" maxlength="500">
            <button class="btn btn-outline-secondary"
                    onclick="submitResponse(${fb.feedback_id})">Send</button>
          </div>
          <div id="response-error-${fb.feedback_id}"
               class="text-danger mt-1" style="font-size:0.85rem;"></div>
        </div>` : ''}
    </div>`;

  return card;
}

async function loadResponses(feedbackId) {
  const container = document.getElementById(`responses-${feedbackId}`);
  const { data } = await apiFetch(`/feedback/${feedbackId}/responses`);

  if (!data.success || data.responses.length === 0) {
    container.innerHTML = '<small class="text-muted">No responses yet.</small>';
    return;
  }

  container.innerHTML = data.responses.map(r => {
    const isMine = currentUserId && Number(r.member_id) === Number(currentUserId);
    return `
      <div class="d-flex justify-content-between align-items-start mb-1"
           id="response-row-${r.response_id}">
        <div>
          <span class="fw-semibold me-1" style="font-size:0.9rem;">
            ${escapeHtml(r.username || 'Member')}:
          </span>
          <span style="font-size:0.9rem;">${escapeHtml(r.response_text)}</span>
          <small class="text-muted ms-1">${new Date(r.created_at).toLocaleString()}</small>
        </div>
        ${isMine ? `
          <button class="btn btn-link btn-sm text-danger p-0 ms-2"
                  onclick="deleteResponse(${r.response_id})">Delete</button>` : ''}
      </div>`;
  }).join('');
}

async function submitResponse(feedbackId) {
  const input   = document.getElementById(`response-input-${feedbackId}`);
  const errorEl = document.getElementById(`response-error-${feedbackId}`);
  const text    = input.value.trim();

  errorEl.textContent = '';
  if (!text) { errorEl.textContent = 'Response cannot be empty.'; return; }

  const { data } = await apiFetch(`/feedback/${feedbackId}/responses`, 'POST', { response_text: text });

  if (data.success) { input.value = ''; loadResponses(feedbackId); }
  else { errorEl.textContent = data.message || 'Failed to submit response.'; }
}

async function deleteResponse(responseId) {
  if (!confirm('Delete this response?')) return;
  const { data } = await apiFetch(`/feedback/responses/${responseId}`, 'DELETE');
  if (data.success) {
    const row = document.getElementById(`response-row-${responseId}`);
    if (row) row.remove();
  } else { alert(data.message || 'Failed to delete response.'); }
}

async function deleteFeedback(feedbackId) {
  if (!confirm('Delete this feedback? All responses will also be removed.')) return;
  const { data } = await apiFetch(`/feedback/${feedbackId}`, 'DELETE');
  if (data.success) {
    const card = document.getElementById(`feedback-card-${feedbackId}`);
    if (card) card.remove();
    if (!document.querySelector('#feedback-list .card')) {
      document.getElementById('no-feedback').style.display = 'block';
    }
  } else { alert(data.message || 'Failed to delete feedback.'); }
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${i <= rating ? 'text-warning' : 'text-muted'}" style="font-size:1.1rem;">★</span>`;
  }
  return html;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
