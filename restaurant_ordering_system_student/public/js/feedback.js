// public/js/feedback.js
// Drives all three feedback pages: index.html, create.html, edit.html

// Wraps fetchMethod in a Promise so async/await flow is preserved.
// Resolves with { status, data } — status is the HTTP code, data is the JSON body.
function apiFetch(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve(data), method, body);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('feedback-list'))        initFeedbackIndex();
  if (document.getElementById('create-feedback-form')) initCreateFeedback();
  if (document.getElementById('edit-feedback-form'))   initEditFeedback();
});

/* =========================================================
   SHARED HELPERS
   ========================================================= */

function getParams() {
  return new URLSearchParams(window.location.search);
}

function showError(msg) {
  const el = document.getElementById('error-message');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = 'block';
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${i <= rating ? 'text-warning' : 'text-muted'}" style="font-size:1.1rem;">★</span>`;
  }
  return html;
}

/* =========================================================
   PAGE: feedback/index.html
   ========================================================= */

async function initFeedbackIndex() {
  const segments  = window.location.pathname.split('/').filter(Boolean);
  const productId = segments[segments.length - 1];

  const loading          = document.getElementById('loading');
  const noFeedback       = document.getElementById('no-feedback');
  const feedbackList     = document.getElementById('feedback-list');
  const backBtn          = document.getElementById('back-btn');
  const writeFeedbackBtn = document.getElementById('write-feedback-btn');

  if (backBtn)          backBtn.href          = `/member/product-detail?id=${productId}`;
  if (writeFeedbackBtn) writeFeedbackBtn.href = `/feedback/create?productId=${productId}`;

  try {
    const product = await apiFetch(`/products/${productId}`);
    if (product.success) {
      document.getElementById('product-title').textContent =
        `Feedback for ${product.product.name}`;
      document.title = `Feedback — ${product.product.name}`;
    }

    const auth = await apiFetch('/api/auth/status');
    const currentUserId = auth.authenticated ? auth.user.id : null;
    if (auth.authenticated) {
      const navName = document.getElementById('nav-username');
      if (navName) navName.textContent = `Welcome, ${auth.user.name}`;
    }

    const feedbackData = await apiFetch(`/feedback/${productId}/all`);
    loading.style.display = 'none';

    if (!feedbackData.success || feedbackData.feedback.length === 0) {
      noFeedback.style.display = 'block';
      return;
    }

    feedbackList.innerHTML = '';
    for (const fb of feedbackData.feedback) {
      const isOwner = currentUserId && Number(fb.member_id) === Number(currentUserId);
      feedbackList.appendChild(buildFeedbackCard(fb, productId, isOwner, currentUserId));
      loadResponses(fb.feedback_id, currentUserId);
    }

  } catch (err) {
    console.error(err);
    loading.style.display = 'none';
    showError('Failed to load feedback.');
  }
}

function buildFeedbackCard(fb, productId, isOwner, currentUserId) {
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
            <a href="/feedback/${fb.feedback_id}/edit?productId=${productId}"
               class="btn btn-outline-primary btn-sm">Edit</a>
            <button class="btn btn-outline-danger btn-sm"
                    onclick="deleteFeedback(${fb.feedback_id}, ${productId})">Delete</button>
          </div>` : ''}
      </div>
      ${fb.comment
        ? `<p class="mt-2 mb-2">${escapeHtml(fb.comment)}</p>`
        : '<p class="mt-2 mb-2 text-muted"><em>No comment.</em></p>'}
      <div id="responses-${fb.feedback_id}" class="ms-3 mt-2 border-start ps-3">
        <small class="text-muted">Loading responses…</small>
      </div>
      <div class="mt-2">
        <div class="input-group input-group-sm">
          <input type="text" class="form-control"
                 id="response-input-${fb.feedback_id}"
                 placeholder="Write a response…" maxlength="500">
          <button class="btn btn-outline-secondary"
                  onclick="submitResponse(${fb.feedback_id})">Send</button>
        </div>
        <div id="response-error-${fb.feedback_id}" class="text-danger mt-1" style="font-size:0.85rem;"></div>
      </div>
    </div>`;
  return card;
}

async function loadResponses(feedbackId, currentUserId) {
  const container = document.getElementById(`responses-${feedbackId}`);
  const responses = await apiFetch(`/feedback/${feedbackId}/responses`);

  if (!responses.success || responses.responses.length === 0) {
    container.innerHTML = '<small class="text-muted">No responses yet.</small>';
    return;
  }

  container.innerHTML = responses.responses.map(r => {
    const isMine = currentUserId && r.member_id === currentUserId;
    return `
      <div class="d-flex justify-content-between align-items-start mb-1" id="response-row-${r.response_id}">
        <div>
          <span class="fw-semibold me-1" style="font-size:0.9rem;">${escapeHtml(r.username || 'Member')}:</span>
          <span style="font-size:0.9rem;">${escapeHtml(r.response_text)}</span>
          <small class="text-muted ms-1">${new Date(r.created_at).toLocaleString()}</small>
        </div>
        ${isMine ? `<button class="btn btn-link btn-sm text-danger p-0 ms-2"
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

  const result = await apiFetch(`/feedback/${feedbackId}/responses`, 'POST', { response_text: text });

  if (result.success) {
    input.value = '';
    const auth = await apiFetch('/api/auth/status');
    loadResponses(feedbackId, auth.authenticated ? auth.user.id : null);
  } else {
    errorEl.textContent = result.message || 'Failed to submit response.';
  }
}

async function deleteResponse(responseId) {
  if (!confirm('Delete this response?')) return;
  const result = await apiFetch(`/feedback/responses/${responseId}`, 'DELETE');
  if (result.success) {
    const row = document.getElementById(`response-row-${responseId}`);
    if (row) row.remove();
  } else {
    alert(result.message || 'Failed to delete response.');
  }
}

async function deleteFeedback(feedbackId, productId) {
  if (!confirm('Delete this feedback? This will also remove all responses.')) return;
  const result = await apiFetch(`/feedback/${feedbackId}`, 'DELETE');
  if (result.success) {
    const card = document.getElementById(`feedback-card-${feedbackId}`);
    if (card) card.remove();
    if (!document.querySelector('.card.mb-3')) {
      document.getElementById('no-feedback').style.display = 'block';
    }
  } else {
    alert(result.message || 'Failed to delete feedback.');
  }
}

/* =========================================================
   PAGE: feedback/create.html
   ========================================================= */

async function initCreateFeedback() {
  const params      = getParams();
  const orderItemId = params.get('orderItemId');
  const productId   = params.get('productId');
  const backBtn     = document.getElementById('back-btn');
  const cancelBtn   = document.getElementById('cancel-btn');

  const backUrl = productId ? `/member/product-detail?id=${productId}` : '/orders/my-orders';
  if (backBtn)   backBtn.href   = backUrl;
  if (cancelBtn) cancelBtn.href = backUrl;

  document.getElementById('product-id').value    = productId   || '';
  document.getElementById('order-item-id').value = orderItemId || '';

  const auth = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    const navName = document.getElementById('nav-username');
    if (navName) navName.textContent = `Welcome, ${auth.user.name}`;
  }

  if (productId) {
    const product = await apiFetch(`/products/${productId}`);
    if (product.success) {
      document.title = `Write Feedback — ${product.product.name}`;
      const title = document.getElementById('form-title');
      if (title) title.textContent = `Write Feedback for ${product.product.name}`;
    }
  }

  if (orderItemId) {
    const eligibility = await apiFetch(`/feedback/order-item/${orderItemId}/eligibility`);
    const notEligEl = document.getElementById('not-eligible-msg');
    if (notEligEl && !eligibility.eligible) {
      notEligEl.textContent   = eligibility.reason || 'You cannot submit feedback for this order.';
      notEligEl.style.display = 'block';
      document.getElementById('submit-btn').disabled = true;
    }
  }

  document.getElementById('create-feedback-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rating      = document.getElementById('rating').value;
    const comment     = document.getElementById('comment').value.trim();
    const orderItemId = document.getElementById('order-item-id').value;
    const productId   = document.getElementById('product-id').value;
    const btn         = document.getElementById('submit-btn');

    if (!rating)      { showError('Please select a rating.'); return; }
    if (!comment)     { showError('Please enter a comment.'); return; }
    if (!orderItemId) { showError('Order item reference missing. Please go back and try again.'); return; }

    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    const result = await apiFetch('/feedback', 'POST', {
      order_item_id: parseInt(orderItemId),
      rating:        parseInt(rating),
      comment
    });

    if (result.success) {
      window.location.href = productId
        ? `/member/product-detail?id=${productId}`
        : '/orders/my-orders';
    } else {
      showError(result.message || 'Failed to submit feedback.');
      btn.disabled    = false;
      btn.textContent = 'Submit Feedback';
    }
  });
}

/* =========================================================
   PAGE: feedback/edit.html
   ========================================================= */

async function initEditFeedback() {
  const params     = getParams();
  const productId  = params.get('productId');
  const segments   = window.location.pathname.split('/');
  const feedbackId = segments[segments.length - 2];

  const loading   = document.getElementById('loading');
  const container = document.getElementById('edit-form-container');
  const backBtn   = document.getElementById('back-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  const productDetailUrl = `/member/product-detail?id=${productId}`;
  if (backBtn)   backBtn.href   = productDetailUrl;
  if (cancelBtn) cancelBtn.href = productDetailUrl;

  const auth = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    const navName = document.getElementById('nav-username');
    if (navName) navName.textContent = `Welcome, ${auth.user.name}`;
  }

  const feedbackDetail = await apiFetch(`/feedback/${feedbackId}/detail`);
  loading.style.display = 'none';

  if (!feedbackDetail.success) {
    showError(feedbackDetail.message || 'Failed to load feedback.');
    return;
  }

  const fb = feedbackDetail.feedback;
  document.getElementById('feedback-id').value = fb.feedback_id;
  document.getElementById('product-id').value  = fb.product_id;
  document.getElementById('rating').value       = fb.rating;
  document.getElementById('comment').value      = fb.comment || '';
  container.style.display = 'block';

  document.getElementById('edit-feedback-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fbId    = document.getElementById('feedback-id').value;
    const pid     = document.getElementById('product-id').value;
    const rating  = document.getElementById('rating').value;
    const comment = document.getElementById('comment').value.trim();
    const btn     = document.getElementById('submit-btn');

    if (!rating) { showError('Please select a rating.'); return; }

    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const result = await apiFetch(`/feedback/${fbId}`, 'PUT', {
      rating: parseInt(rating),
      comment
    });

    if (result.success) {
      window.location.href = `/member/product-detail?id=${pid}`;
    } else {
      showError(result.message || 'Failed to update feedback.');
      btn.disabled    = false;
      btn.textContent = 'Save Changes';
    }
  });
}

/* =========================================================
   UTILITY
   ========================================================= */

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
