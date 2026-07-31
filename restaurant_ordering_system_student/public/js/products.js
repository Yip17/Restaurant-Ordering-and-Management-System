// public/js/products.js
// Drives products.html — member product listing

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

  loadProducts();
});

function loadProducts() {
  fetchMethod('/products', (status, data) => {
    const tbody      = document.getElementById('product-table-body');
    const noProducts = document.getElementById('no-products');

    tbody.innerHTML = '';

    if (!data.success || data.products.length === 0) {
      noProducts.style.display = 'block';
      return;
    }

    data.products.forEach(product => {
      const row = document.createElement('tr');
      row.id = `product-row-${product.product_id}`;
      row.innerHTML = `
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.description || '—')}</td>
        <td>${escapeHtml(product.category || '—')}</td>
        <td>$${parseFloat(product.price).toFixed(2)}</td>
        <td>
          <span class="badge ${product.is_available ? 'bg-success' : 'bg-secondary'}">
            ${product.is_available ? 'Available' : 'Unavailable'}
          </span>
        </td>
        <td>${new Date(product.created_at).toLocaleDateString()}</td>
        <td>
          <a href="/member/product-detail?id=${product.product_id}"
             class="btn btn-outline-primary btn-sm">View Details</a>
        </td>
        <td>
          ${product.is_available
            ? `<button class="btn btn-success btn-sm"
                        onclick="quickAddToCart(${product.product_id}, this)">
                 + Add to Cart
               </button>`
            : `<span class="text-muted" style="font-size:.85rem;">Unavailable</span>`
          }
          <div id="cart-msg-${product.product_id}" class="mt-1" style="font-size:.8rem;"></div>
        </td>`;
      tbody.appendChild(row);
    });
  });
}

// Quick-add 1 unit directly from the product list
async function quickAddToCart(productId, btn) {
  const msgEl = document.getElementById(`cart-msg-${productId}`);
  btn.disabled    = true;
  btn.textContent = '…';
  msgEl.textContent = '';

  const result = await apiFetch('/cart/items', 'POST', {
    product_id: productId,
    quantity:   1
  });

  btn.disabled    = false;
  btn.textContent = '+ Add to Cart';

  if (result.success) {
    msgEl.style.color = 'green';
    msgEl.innerHTML   = `✓ Added! <a href="/cart/retrieve/all">View Cart</a>`;
  } else {
    msgEl.style.color = 'red';
    msgEl.textContent = result.message || 'Failed.';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
