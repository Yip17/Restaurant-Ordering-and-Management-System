// public/js/cart.js
// Drives cart.html
// UX: quantity stepper (+ / −) auto-saves on change, "Remove" deletes the item.

function apiFetch(url, method, body) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve(data), method || 'GET', body || null);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    document.getElementById('nav-username').textContent = `Welcome, ${auth.user.name}`;
  }
  loadCart();
});

// ─────────────────────────────────────────────────────────────────────────────
async function loadCart() {
  const loading = document.getElementById('loading');
  const empty   = document.getElementById('empty-cart');
  const content = document.getElementById('cart-content');
  const errEl   = document.getElementById('action-error');

  loading.style.display = 'block';
  empty.style.display   = 'none';
  content.style.display = 'none';
  errEl.style.display   = 'none';

  const data = await apiFetch('/cart/items');
  loading.style.display = 'none';

  if (!data.success) {
    errEl.textContent   = data.message || 'Failed to load cart.';
    errEl.style.display = 'block';
    return;
  }

  if (!data.items || data.items.length === 0) {
    empty.style.display = 'block';
    return;
  }

  renderCartItems(data.items);
  renderSummary(data.summary);
  content.style.display = 'block';
}

// ─────────────────────────────────────────────────────────────────────────────
function renderCartItems(items) {
  const list = document.getElementById('cart-items-list');
  list.innerHTML = '';

  items.forEach((item, idx) => {
    const unitPrice = parseFloat(item.product.price);
    const div = document.createElement('div');
    div.className = 'cart-item-card px-3 py-3';
    div.id = `item-${item.cartItemId}`;

    div.innerHTML = `
      <div class="d-flex align-items-start gap-3">
        <!-- Info -->
        <div class="flex-grow-1">
          <div class="fw-semibold">${escapeHtml(item.product.name)}</div>
          <div class="text-muted" style="font-size:.85rem;">
            ${escapeHtml(item.product.category || '')}
          </div>
          <div class="text-muted" style="font-size:.85rem;">
            Unit price: $${unitPrice.toFixed(2)}
          </div>
        </div>

        <!-- Qty stepper -->
        <div class="d-flex flex-column align-items-center gap-1">
          <div class="qty-stepper">
            <button class="btn btn-outline-secondary btn-sm"
                    onclick="stepQty(${item.cartItemId}, ${unitPrice}, -1)"
                    id="btn-minus-${item.cartItemId}">−</button>
            <span class="qty-display" id="qty-${item.cartItemId}">${item.quantity}</span>
            <button class="btn btn-outline-secondary btn-sm"
                    onclick="stepQty(${item.cartItemId}, ${unitPrice}, +1)"
                    id="btn-plus-${item.cartItemId}">+</button>
          </div>
          <span class="item-subtotal" id="subtotal-${item.cartItemId}">
            $${(unitPrice * item.quantity).toFixed(2)}
          </span>
        </div>

        <!-- Remove -->
        <div class="ms-2 d-flex align-items-start pt-1">
          <button class="btn btn-link text-danger p-0" style="font-size:.85rem; text-decoration:none;"
                  onclick="handleRemove(${item.cartItemId})">Remove</button>
        </div>
      </div>`;

    list.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// + / − stepper — immediately calls PUT to update qty, refreshes subtotal & summary
// ─────────────────────────────────────────────────────────────────────────────
async function stepQty(cartItemId, unitPrice, delta) {
  const qtyEl = document.getElementById(`qty-${cartItemId}`);
  const errEl = document.getElementById('action-error');
  errEl.style.display = 'none';

  const current  = parseInt(qtyEl.textContent) || 1;
  const newQty   = current + delta;

  if (newQty < 1) {
    // At qty 1 pressing − removes the item (like UNIQLO behaviour)
    handleRemove(cartItemId);
    return;
  }

  // Optimistic update in the UI
  qtyEl.textContent = newQty;
  document.getElementById(`subtotal-${cartItemId}`).textContent =
    `$${(unitPrice * newQty).toFixed(2)}`;

  // Persist to backend
  const result = await apiFetch(`/cart/items/${cartItemId}`, 'PUT', { quantity: newQty });

  if (result.success) {
    renderSummary(result.summary);
  } else {
    // Rollback optimistic update
    qtyEl.textContent = current;
    document.getElementById(`subtotal-${cartItemId}`).textContent =
      `$${(unitPrice * current).toFixed(2)}`;
    errEl.textContent   = result.message || 'Failed to update quantity.';
    errEl.style.display = 'block';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove item — no confirm dialog, just fires DELETE
// ─────────────────────────────────────────────────────────────────────────────
async function handleRemove(cartItemId) {
  const errEl   = document.getElementById('action-error');
  const empty   = document.getElementById('empty-cart');
  const content = document.getElementById('cart-content');

  errEl.style.display = 'none';

  const result = await apiFetch(`/cart/items/${cartItemId}`, 'DELETE');

  if (result.success) {
    const row = document.getElementById(`item-${cartItemId}`);
    if (row) row.remove();

    renderSummary(result.summary);

    // If nothing left, switch to empty state
    if (document.getElementById('cart-items-list').children.length === 0) {
      content.style.display = 'none';
      empty.style.display   = 'block';
    }
  } else {
    errEl.textContent   = result.message || 'Failed to remove item.';
    errEl.style.display = 'block';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function renderSummary(summary) {
  document.getElementById('summary-item-count').textContent = summary.totalItems;
  document.getElementById('summary-total-qty').textContent  = summary.totalQuantity;
  document.getElementById('summary-subtotal').textContent   = `$${summary.subtotal}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
