// public/js/orders.js
// Drives orders.html — member's order list with cancel action

// Wraps fetchMethod in a Promise so async/await flow is preserved.
// Resolves with { status, data } — status is the HTTP code, data is the JSON body.
function apiFetch(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve(data), method, body);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    document.getElementById('nav-username').textContent = `Welcome, ${auth.user.name}`;
  }
  loadOrders();
});

async function loadOrders() {
  const loading  = document.getElementById('loading');
  const noOrders = document.getElementById('no-orders');
  const list     = document.getElementById('orders-list');
  const errEl    = document.getElementById('error-message');

  const orders = await apiFetch('/orders/my');
  loading.style.display = 'none';

  if (!orders.success || orders.orders.length === 0) {
    noOrders.style.display = 'block';
    return;
  }

  list.innerHTML = '';
  orders.orders.forEach(order => list.appendChild(buildOrderCard(order)));
}

function buildOrderCard(order) {
  const statusClass = { COMPLETED: 'success', CANCELLED: 'danger', PACKING: 'warning' };
  const badge = `<span class="badge bg-${statusClass[order.status] || 'secondary'}">${order.status}</span>`;

  const itemsHtml = order.items.map(item => `
    <tr>
      <td>${escapeHtml(item.product_name)}</td>
      <td>${item.quantity}</td>
      <td>$${parseFloat(item.unit_price).toFixed(2)}</td>
      <td>$${parseFloat(item.subtotal).toFixed(2)}</td>
      <td>
        ${order.status === 'COMPLETED'
          ? `<a href="/feedback/create?orderItemId=${item.order_item_id}&productId=${item.product_id}"
                class="btn btn-outline-primary btn-sm">Write Feedback</a>`
          : '—'}
      </td>
    </tr>`).join('');

  const canCancel = order.status === 'PACKING';

  const div = document.createElement('div');
  div.className = 'card mb-3';
  div.id = `order-${order.order_id}`;
  div.innerHTML = `
    <div class="card-header d-flex justify-content-between align-items-center">
      <span>Order #${order.order_id} &nbsp; ${badge}</span>
      <span class="text-muted" style="font-size:.85rem;">
        ${new Date(order.order_date).toLocaleString()}
      </span>
    </div>
    <div class="card-body">
      <p class="mb-2"><strong>Delivery to:</strong> ${escapeHtml(order.delivery_address || '—')}</p>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-2">
          <thead>
            <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th>Action</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <strong>Total: $${parseFloat(order.total_amount).toFixed(2)}</strong>
        ${canCancel
          ? `<button class="btn btn-outline-danger btn-sm"
                     onclick="cancelOrder(${order.order_id})">Cancel Order</button>`
          : ''}
      </div>
    </div>`;
  return div;
}

function cancelOrder(orderId) {
  if (!confirm('Cancel this order?')) return;
  fetchMethod(
    `/orders/${orderId}/status`,
    (status, data) => {
      if (data.success) { loadOrders(); }
      else { alert(data.message || 'Failed to cancel order.'); }
    },
    'PUT',
    { status: 'CANCELLED' }
  );
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
