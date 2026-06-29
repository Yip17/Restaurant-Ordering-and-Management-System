// public/js/product-detail.js
// Drives product-detail.html
// Handles: product info, place order, feedback list + responses

// ── State ─────────────────────────────────────────────────────────────────
let currentProductId = null;
let currentUserId    = null;

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await fetch('/api/auth/status');
    const d = await r.json();
    if (d.authenticated) {
      currentUserId = d.user.id;
      document.getElementById('nav-username').textContent = `Welcome, ${d.user.name}`;
    }
  } catch (_) {}

  await fetchProductDetail();
});

// ── Product detail ────────────────────────────────────────────────────────
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

  try {
    const res  = await fetch(`/products/${currentProductId}`);
    const data = await res.json();
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

  } catch (err) {
    console.error(err);
    loading.style.display = 'none';
    errEl.style.display   = 'block';
  }
}

// ── Order form ────────────────────────────────────────────────────────────
async function handleOrderSubmit(e) {
  e.preventDefault();
  const successEl = document.getElementById('order-success');
  const errorEl   = document.getElementById('order-error');
  const btn       = document.getElementById('order-btn');

  successEl.style.display = 'none';
  errorEl.style.display   = 'none';
  btn.disabled    = true;
  btn.textContent = 'Placing order…';

  try {
    const res  = await fetch('/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id:       currentProductId,
        quantity:         parseInt(document.getElementById('quantity').value),
        delivery_address: document.getElementById('delivery-address').value.trim()
      })
    });
    const data = await res.json();

    if (data.success) {
      successEl.innerHTML = `Order placed! Status: <strong>PACKING</strong>.
        <a href="/orders/my-orders" class="alert-link ms-2">View My Orders →</a>`;
      successEl.style.display = 'block';
      document.getElementById('order-form').reset();
    } else {
      errorEl.textContent   = data.message || 'Failed to place order.';
      errorEl.style.display = 'block';
    }
  } catch (_) {
    errorEl.textContent   = 'An error occurred.';
    errorEl.style.display = 'block';
  }

  btn.disabled    = false;
  btn.textContent = 'Order Now';
}

// ── Feedback section ──────────────────────────────────────────────────────
async function loadFeedbackSection() {
  await Promise.all([
    setupWriteFeedbackButton(),
    loadFeedbackList()
  ]);
}

// The Write Feedback button on product-detail links to My Orders.
// Feedback is now per order item — members write feedback from the My Orders page
// where each completed order item has its own "Write Feedback" link.
// We still show the button here for discoverability, pointing to My Orders.
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

  try {
    const res  = await fetch(`/feedback/${currentProductId}/all`);
    const data = await res.json();

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
      const card    = buildFeedbackCard(fb, isOwner);
      fbList.appendChild(card);
      loadResponses(fb.feedback_id);
    }

  } catch (_) {
    fbLoading.style.display = 'none';
    fbError.textContent     = 'Failed to load feedback.';
    fbError.style.display   = 'block';
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
          <small class="text-muted ms-2">${new Date(fb.created_at).toLocaleDateString()}</small>
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

// ── Responses ─────────────────────────────────────────────────────────────
async function loadResponses(feedbackId) {
  const container = document.getElementById(`responses-${feedbackId}`);
  try {
    const res  = await fetch(`/feedback/${feedbackId}/responses`);
    const data = await res.json();

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
            <small class="text-muted ms-1">${new Date(r.created_at).toLocaleDateString()}</small>
          </div>
          ${isMine ? `
            <button class="btn btn-link btn-sm text-danger p-0 ms-2"
                    onclick="deleteResponse(${r.response_id})">Delete</button>` : ''}
        </div>`;
    }).join('');

  } catch (_) {
    container.innerHTML = '<small class="text-danger">Could not load responses.</small>';
  }
}

async function submitResponse(feedbackId) {
  const input   = document.getElementById(`response-input-${feedbackId}`);
  const errorEl = document.getElementById(`response-error-${feedbackId}`);
  const text    = input.value.trim();

  errorEl.textContent = '';
  if (!text) { errorEl.textContent = 'Response cannot be empty.'; return; }

  try {
    const res  = await fetch(`/feedback/${feedbackId}/responses`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ response_text: text })
    });
    const data = await res.json();
    if (data.success) { input.value = ''; loadResponses(feedbackId); }
    else { errorEl.textContent = data.message || 'Failed to submit response.'; }
  } catch (_) { errorEl.textContent = 'An error occurred.'; }
}

async function deleteResponse(responseId) {
  if (!confirm('Delete this response?')) return;
  try {
    const res  = await fetch(`/feedback/responses/${responseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const row = document.getElementById(`response-row-${responseId}`);
      if (row) row.remove();
    } else { alert(data.message || 'Failed to delete response.'); }
  } catch (_) { alert('An error occurred.'); }
}

async function deleteFeedback(feedbackId) {
  if (!confirm('Delete this feedback? All responses will also be removed.')) return;
  try {
    const res  = await fetch(`/feedback/${feedbackId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`feedback-card-${feedbackId}`);
      if (card) card.remove();
      if (!document.querySelector('#feedback-list .card')) {
        document.getElementById('no-feedback').style.display = 'block';
      }
    } else { alert(data.message || 'Failed to delete feedback.'); }
  } catch (_) { alert('An error occurred.'); }
}

// ── Utilities ─────────────────────────────────────────────────────────────
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
