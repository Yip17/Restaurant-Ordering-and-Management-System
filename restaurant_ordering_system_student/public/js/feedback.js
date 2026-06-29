// public/js/feedback.js
// Drives all three feedback pages: index.html, create.html, edit.html
// Detects which page is active by looking for a unique element on each page.

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('feedback-list'))   initFeedbackIndex();
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
  el.textContent = msg;
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
   URL pattern: /feedback/:productId
   ========================================================= */

async function initFeedbackIndex() {
  // productId lives in the URL path, e.g. /feedback/3
  const segments  = window.location.pathname.split('/').filter(Boolean);
  const productId = segments[segments.length - 1];

  const loading          = document.getElementById('loading');
  const noFeedback       = document.getElementById('no-feedback');
  const feedbackList     = document.getElementById('feedback-list');
  const backBtn          = document.getElementById('back-btn');
  const writeFeedbackBtn = document.getElementById('write-feedback-btn');

  // Back button → product-detail page
  if (backBtn) backBtn.href = `/member/product-detail?id=${productId}`;

  // Write Feedback button always links to create page — eligibility checked on submit
  if (writeFeedbackBtn) writeFeedbackBtn.href = `/feedback/create?productId=${productId}`;

  try {
    // Load product name for the heading
    const prodRes  = await fetch(`/products/${productId}`);
    const prodData = await prodRes.json();
    if (prodData.success) {
      document.getElementById('product-title').textContent =
        `Feedback for ${prodData.product.name}`;
      document.title = `Feedback — ${prodData.product.name}`;
    }

    // Load current user so we can show Edit/Delete on own entries
    const authRes       = await fetch('/api/auth/status');
    const authData      = await authRes.json();
    const currentUserId = authData.authenticated ? authData.user.id : null;

    // Show username in navbar
    if (authData.authenticated) {
      const navName = document.getElementById('nav-username');
      if (navName) navName.textContent = `Welcome, ${authData.user.name}`;
    }

    // Fetch all feedback for this product
    const fbRes  = await fetch(`/feedback/${productId}/all`);
    const fbData = await fbRes.json();

    loading.style.display = 'none';

    if (!fbData.success || fbData.feedback.length === 0) {
      noFeedback.style.display = 'block';
      return;
    }

    feedbackList.innerHTML = '';
    for (const fb of fbData.feedback) {
      const isOwner = currentUserId && Number(fb.member_id) === Number(currentUserId);
      const card    = buildFeedbackCard(fb, productId, isOwner, currentUserId);
      feedbackList.appendChild(card);
      // Load responses AFTER the card is in the DOM so getElementById finds the container
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
          <small class="text-muted ms-2">${new Date(fb.created_at).toLocaleDateString()}</small>
        </div>
        ${isOwner ? `
          <div class="d-flex gap-2">
            <a href="/feedback/${fb.feedback_id}/edit?productId=${productId}"
               class="btn btn-outline-primary btn-sm">Edit</a>
            <button class="btn btn-outline-danger btn-sm"
                    onclick="deleteFeedback(${fb.feedback_id}, ${productId})">Delete</button>
          </div>` : ''}
      </div>

      ${fb.comment ? `<p class="mt-2 mb-2">${escapeHtml(fb.comment)}</p>` : '<p class="mt-2 mb-2 text-muted"><em>No comment.</em></p>'}

      <!-- Responses section -->
      <div id="responses-${fb.feedback_id}" class="ms-3 mt-2 border-start ps-3">
        <small class="text-muted">Loading responses…</small>
      </div>

      <!-- Response form — shown to non-authors only -->
      ${!isOwner ? `
        <div class="mt-2">
          <div class="input-group input-group-sm">
            <input type="text" class="form-control"
                   id="response-input-${fb.feedback_id}"
                   placeholder="Write a response…"
                   maxlength="500">
            <button class="btn btn-outline-secondary"
                    onclick="submitResponse(${fb.feedback_id})">Send</button>
          </div>
          <div id="response-error-${fb.feedback_id}" class="text-danger mt-1" style="font-size:0.85rem;"></div>
        </div>` : ''}
    </div>
  `;

  // Card is returned; caller appends it to the DOM and then calls loadResponses()
  return card;
}

async function loadResponses(feedbackId, currentUserId) {
  const container = document.getElementById(`responses-${feedbackId}`);
  try {
    const res  = await fetch(`/feedback/${feedbackId}/responses`);
    const data = await res.json();

    if (!data.success || data.responses.length === 0) {
      container.innerHTML = '<small class="text-muted">No responses yet.</small>';
      return;
    }

    container.innerHTML = data.responses.map(r => {
      const isMine = currentUserId && r.member_id === currentUserId;
      return `
        <div class="d-flex justify-content-between align-items-start mb-1" id="response-row-${r.response_id}">
          <div>
            <span class="fw-semibold me-1" style="font-size:0.9rem;">${escapeHtml(r.username || 'Member')}:</span>
            <span style="font-size:0.9rem;">${escapeHtml(r.response_text)}</span>
            <small class="text-muted ms-1">${new Date(r.created_at).toLocaleDateString()}</small>
          </div>
          ${isMine ? `<button class="btn btn-link btn-sm text-danger p-0 ms-2"
                        onclick="deleteResponse(${r.response_id})">Delete</button>` : ''}
        </div>`;
    }).join('');

  } catch (_) {
    container.innerHTML = '<small class="text-danger">Could not load responses.</small>';
  }
}

async function submitResponse(feedbackId) {
  const input    = document.getElementById(`response-input-${feedbackId}`);
  const errorEl  = document.getElementById(`response-error-${feedbackId}`);
  const text     = input.value.trim();

  errorEl.textContent = '';

  if (!text) {
    errorEl.textContent = 'Response cannot be empty.';
    return;
  }

  try {
    const res  = await fetch(`/feedback/${feedbackId}/responses`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ response_text: text })
    });
    const data = await res.json();

    if (data.success) {
      input.value = '';
      // Reload current user id and refresh
      const authRes  = await fetch('/api/auth/status');
      const authData = await authRes.json();
      loadResponses(feedbackId, authData.authenticated ? authData.user.id : null);
    } else {
      errorEl.textContent = data.message || 'Failed to submit response.';
    }
  } catch (_) {
    errorEl.textContent = 'An error occurred.';
  }
}

async function deleteResponse(responseId) {
  if (!confirm('Delete this response?')) return;
  try {
    const res  = await fetch(`/feedback/responses/${responseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const row = document.getElementById(`response-row-${responseId}`);
      if (row) row.remove();
    } else {
      alert(data.message || 'Failed to delete response.');
    }
  } catch (_) {
    alert('An error occurred.');
  }
}

async function deleteFeedback(feedbackId, productId) {
  if (!confirm('Delete this feedback? This will also remove all responses.')) return;
  try {
    const res  = await fetch(`/feedback/${feedbackId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`feedback-card-${feedbackId}`);
      if (card) card.remove();
      // Show empty state if nothing left
      if (!document.querySelector('.card.mb-3')) {
        document.getElementById('no-feedback').style.display = 'block';
      }
    } else {
      alert(data.message || 'Failed to delete feedback.');
    }
  } catch (_) {
    alert('An error occurred.');
  }
}

/* =========================================================
   PAGE: feedback/create.html
   URL pattern: /feedback/create?productId=X
   ========================================================= */

async function initCreateFeedback() {
  const params      = getParams();
  const orderItemId = params.get('orderItemId');
  const productId   = params.get('productId');
  const backBtn     = document.getElementById('back-btn');
  const cancelBtn   = document.getElementById('cancel-btn');

  // Back returns to My Orders (which is the entry point for per-order feedback)
  const backUrl = productId
    ? `/member/product-detail?id=${productId}`
    : '/orders/my-orders';
  if (backBtn)   backBtn.href   = backUrl;
  if (cancelBtn) cancelBtn.href = backUrl;

  document.getElementById('product-id').value    = productId   || '';
  document.getElementById('order-item-id').value = orderItemId || '';

  // Show username in navbar
  try {
    const authRes  = await fetch('/api/auth/status');
    const authData = await authRes.json();
    if (authData.authenticated) {
      const navName = document.getElementById('nav-username');
      if (navName) navName.textContent = `Welcome, ${authData.user.name}`;
    }
  } catch (_) {}

  // Load product name for the title
  if (productId) {
    try {
      const res  = await fetch(`/products/${productId}`);
      const data = await res.json();
      if (data.success) {
        document.title = `Write Feedback — ${data.product.name}`;
        const title = document.getElementById('form-title');
        if (title) title.textContent = `Write Feedback for ${data.product.name}`;
      }
    } catch (_) {}
  }

  // Check eligibility for THIS specific order item
  // Authorization: order item must belong to member + order must be COMPLETED
  if (orderItemId) {
    try {
      const eligRes  = await fetch(`/feedback/order-item/${orderItemId}/eligibility`);
      const eligData = await eligRes.json();
      const notEligEl = document.getElementById('not-eligible-msg');
      if (notEligEl && !eligData.eligible) {
        notEligEl.textContent   = eligData.reason || 'You cannot submit feedback for this order.';
        notEligEl.style.display = 'block';
        document.getElementById('submit-btn').disabled = true;
      }
    } catch (_) {}
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

    try {
      const res  = await fetch('/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          order_item_id: parseInt(orderItemId),
          rating:        parseInt(rating),
          comment
        })
      });
      const data = await res.json();

      if (data.success) {
        // Return to product detail page where all feedback is displayed
        window.location.href = productId
          ? `/member/product-detail?id=${productId}`
          : '/orders/my-orders';
      } else {
        showError(data.message || 'Failed to submit feedback.');
        btn.disabled    = false;
        btn.textContent = 'Submit Feedback';
      }
    } catch (_) {
      showError('An error occurred.');
      btn.disabled    = false;
      btn.textContent = 'Submit Feedback';
    }
  });
}

/* =========================================================
   PAGE: feedback/edit.html
   URL pattern: /feedback/:id/edit?productId=X
   ========================================================= */

async function initEditFeedback() {
  const params     = getParams();
  const productId  = params.get('productId');
  const segments   = window.location.pathname.split('/');
  // /feedback/<id>/edit  →  segments = ['', 'feedback', '<id>', 'edit']
  const feedbackId = segments[segments.length - 2];

  const loading   = document.getElementById('loading');
  const container = document.getElementById('edit-form-container');
  const backBtn   = document.getElementById('back-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  // Back and Cancel return to the product detail page
  const productDetailUrl = `/member/product-detail?id=${productId}`;
  if (backBtn)   backBtn.href   = productDetailUrl;
  if (cancelBtn) cancelBtn.href = productDetailUrl;

  // Show username in navbar
  try {
    const authRes  = await fetch('/api/auth/status');
    const authData = await authRes.json();
    if (authData.authenticated) {
      const navName = document.getElementById('nav-username');
      if (navName) navName.textContent = `Welcome, ${authData.user.name}`;
    }
  } catch (_) {}

  // Pre-populate form with existing feedback data
  try {
    const res  = await fetch(`/feedback/${feedbackId}/detail`);
    const data = await res.json();

    loading.style.display = 'none';

    if (!data.success) {
      showError(data.message || 'Failed to load feedback.');
      return;
    }

    const fb = data.feedback;
    document.getElementById('feedback-id').value = fb.feedback_id;
    document.getElementById('product-id').value  = fb.product_id;
    document.getElementById('rating').value       = fb.rating;
    document.getElementById('comment').value      = fb.comment || '';

    container.style.display = 'block';

  } catch (_) {
    loading.style.display = 'none';
    showError('Failed to load feedback.');
    return;
  }

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

    try {
      const res  = await fetch(`/feedback/${fbId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rating: parseInt(rating), comment })
      });
      const data = await res.json();

      if (data.success) {
        // Return to product detail page where feedback is displayed
        window.location.href = `/member/product-detail?id=${pid}`;
      } else {
        showError(data.message || 'Failed to update feedback.');
        btn.disabled    = false;
        btn.textContent = 'Save Changes';
      }
    } catch (_) {
      showError('An error occurred.');
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
