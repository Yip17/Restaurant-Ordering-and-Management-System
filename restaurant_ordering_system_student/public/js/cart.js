// public/js/cart.js
// Drives cart.html — view, update, delete cart items

function apiFetch(url, method, body) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve(data), method || 'GET', body || null);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Set nav username
  const auth = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    document.getElementById('nav-username').textContent = `Welcome, ${auth.user.name}`;
  }

  loadCart();
});

// ─────────────────────────────────────────────
// Load cart from backend and render
// ─────────────────────────────────────────────
async function loadCart() {
  const loading   = document.getElementById('loading');
  const emptyCart = document.getElementById('empty-cart');
  const content   = document.getElementById('cart-content');
  const errorEl   = document.getElementById('error-message');

  loading.style.display   = 'block';
  emptyCart.style.display = 'none';
  content.style.display   = 'none';
  errorEl.style.display   = 'none';

  const data = await apiFetch('/cart/items');
  loading.style.display = 'none';

  if (!data.success) {
    errorEl.textContent   = data.message || 'Failed to load cart.';
    errorEl.style.display = 'block';
    return;
  }

  if (!data.items || data.items.length === 0) {
    emptyCart.style.display = 'block';
    return;
  }

  renderCartItems(data.items);
  renderSummary(data.summary);
  content.style.display = 'block';
}

// ─────────────────────────────────────────────
// Render cart item rows into the table
// ─────────────────────────────────────────────
function renderCartItems(items) {
  const tbody = document.getElementById('cart-table-body');
  tbody.innerHTML = '';

  items.forEach(item => {
    const unitPrice = parseFloat(item.product.price);
    const subtotal  = (unitPrice * item.quantity).toFixed(2);

    const tr = document.createElement('tr');
    tr.id = `row-${item.cartItemId}`;
    tr.innerHTML = `
      <td>${escapeHtml(item.product.name)}</td>
      <td>${escapeHtml(item.product.category || '—')}</td>
      <td>$${unitPrice.toFixed(2)}</td>
      <td>
        <input type="number"
               class="form-control form-control-sm"
               id="qty-${item.cartItemId}"
               value="${item.quantity}"
               min="1" max="99"
               style="width:80px;">
      </td>
      <td id="subtotal-${item.cartItemId}">$${subtotal}</td>
      <td>
        <button class="btn btn-primary btn-sm me-1"
                onclick="handleUpdate(${item.cartItemId})">Update</button>
        <button class="btn btn-danger btn-sm"
                onclick="handleDelete(${item.cartItemId})">Delete</button>
      </td>`;
    tbody.appendChild(tr);

    // Live subtotal preview when qty input changes
    document.getElementById(`qty-${item.cartItemId}`).addEventListener('input', () => {
      const newQty = parseInt(document.getElementById(`qty-${item.cartItemId}`).value) || 0;
      document.getElementById(`subtotal-${item.cartItemId}`).textContent =
        `$${(unitPrice * newQty).toFixed(2)}`;
    });
  });
}

// ─────────────────────────────────────────────
// Render cart summary from backend data
// ─────────────────────────────────────────────
function renderSummary(summary) {
  document.getElementById('summary-item-count').textContent = summary.totalItems;
  document.getElementById('summary-total-qty').textContent  = summary.totalQuantity;
  document.getElementById('summary-subtotal').textContent   = `$${summary.subtotal}`;
}

// ─────────────────────────────────────────────
// Update a single cart item quantity
// ─────────────────────────────────────────────
async function handleUpdate(cartItemId) {
  const successEl = document.getElementById('action-success');
  const errorEl   = document.getElementById('action-error');

  successEl.style.display = 'none';
  errorEl.style.display   = 'none';

  const quantity = parseInt(document.getElementById(`qty-${cartItemId}`).value);

  const result = await apiFetch(`/cart/items/${cartItemId}`, 'PUT', { quantity });

  if (result.success) {
    successEl.textContent   = 'Item updated successfully.';
    successEl.style.display = 'block';
    // Update summary from backend response
    renderSummary(result.summary);
  } else {
    errorEl.textContent   = result.message || 'Failed to update item.';
    errorEl.style.display = 'block';
  }
}

// ─────────────────────────────────────────────
// Delete a single cart item
// ─────────────────────────────────────────────
async function handleDelete(cartItemId) {
  if (!confirm('Remove this item from your cart?')) return;

  const successEl = document.getElementById('action-success');
  const errorEl   = document.getElementById('action-error');
  const emptyCart = document.getElementById('empty-cart');
  const content   = document.getElementById('cart-content');

  successEl.style.display = 'none';
  errorEl.style.display   = 'none';

  const result = await apiFetch(`/cart/items/${cartItemId}`, 'DELETE');

  if (result.success) {
    // Remove the row from the table
    const row = document.getElementById(`row-${cartItemId}`);
    if (row) row.remove();

    // Update summary from backend response
    renderSummary(result.summary);

    successEl.textContent   = 'Item removed from cart.';
    successEl.style.display = 'block';

    // If no rows left, show empty state
    if (document.getElementById('cart-table-body').children.length === 0) {
      content.style.display   = 'none';
      emptyCart.style.display = 'block';
    }
  } else {
    errorEl.textContent   = result.message || 'Failed to delete item.';
    errorEl.style.display = 'block';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
