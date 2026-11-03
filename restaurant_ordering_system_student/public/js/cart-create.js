// public/js/cart-create.js
// Drives cart-create.html — add an item to cart

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

  // Load products into the dropdown
  await loadProducts();

  // Handle form submission
  document.getElementById('add-to-cart-form').addEventListener('submit', handleAddToCart);
});

async function loadProducts() {
  const select = document.getElementById('product-select');

  const data = await apiFetch('/products');

  select.innerHTML = '<option value="">-- Select a product --</option>';

  if (!data.success || !data.products || data.products.length === 0) {
    select.innerHTML = '<option value="">No products available</option>';
    return;
  }

  data.products.forEach(p => {
    if (p.is_available) {
      const option = document.createElement('option');
      option.value = p.product_id;
      option.textContent = `${escapeHtml(p.name)} — $${parseFloat(p.price).toFixed(2)} (${escapeHtml(p.category || '—')})`;
      select.appendChild(option);
    }
  });
}

async function handleAddToCart(e) {
  e.preventDefault();

  const successEl = document.getElementById('success-message');
  const errorEl   = document.getElementById('error-message');
  const btn       = document.getElementById('add-btn');

  successEl.style.display = 'none';
  errorEl.style.display   = 'none';

  const productId = document.getElementById('product-select').value;
  const quantity  = parseInt(document.getElementById('quantity').value);

  // Basic front-end guard (backend is authoritative)
  if (!productId) {
    errorEl.textContent   = 'Please select a product.';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Adding…';

  const result = await apiFetch('/cart/items', 'POST', {
    product_id: parseInt(productId),
    quantity
  });

  btn.disabled    = false;
  btn.textContent = 'Add to Cart';

  if (result.success) {
    successEl.innerHTML =
      `Item added to cart! <a href="/cart/retrieve/all" class="alert-link ms-2">View Cart →</a>`;
    successEl.style.display = 'block';
    document.getElementById('add-to-cart-form').reset();
    await loadProducts(); // reload dropdown
  } else {
    errorEl.textContent   = result.message || 'Failed to add item to cart.';
    errorEl.style.display = 'block';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
