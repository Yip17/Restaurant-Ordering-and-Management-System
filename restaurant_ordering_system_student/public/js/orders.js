// public/js/orders.js
// Drives orders.html — member's order list with cancel action

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await fetch('/api/auth/status');
    const d = await r.json();
    if (d.authenticated) {
      document.getElementById('nav-username').textContent = `Welcome, ${d.user.name}`;
    }
  } catch (_) {}

  loadOrders();
});

async function loadOrders() {
  const loading  = document.getElementById('loading');
  const noOrders = document.getElementById('no-orders');
  const list     = document.getElementById('orders-list');
  const errEl    = document.getElementById('error-message');

  try {
    const res  = await fetch('/orders/my');
    const data = await res.json();

    loading.style.display = 'none';

    if (!data.success || data.orders.length === 0) {
      noOrders.style.display = 'block';
      return;
    }

    list.innerHTML = '';
    data.orders.forEach(order => list.appendChild(buildOrderCard(order)));

  } catch (_) {
    loading.style.display = 'none';
    errEl.textContent     = 'Failed to load orders.';
    errEl.style.display   = 'block';
  }
}

function buildOrderCard(order) {
  const statusClass = { COMPLETED: 'success', CANCELLED: 'danger', PACKING: 'warning' };
  const badge = `<span class="badge bg-${statusClass[order.status] || 'secondary'}">${order.status}</span>`;

  const itemsHtml = order.items.map(item => `
    <tr>
      <td>${escHtml(item.product_name)}</td>
      <td>${item.quantity}</td>
      <td>$${parseFloat(item.unit_price).toFixed(2)}</td>
      <td>$${parseFloat(item.subtotal).toFixed(2)}</td>
      <td>
        ${order.status === 'COMPLETED'
          ? `<a href="/feedback/${item.product_id}" class="btn btn-outline-primary btn-sm">Feedback</a>`
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
      <p class="mb-2"><strong>Delivery to:</strong> ${escHtml(order.delivery_address || '—')}</p>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-2">
          <thead>
            <tr>
              <th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th>Action</th>
            </tr>
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

async function cancelOrder(orderId) {
  if (!confirm('Cancel this order?')) return;
  try {
    const res  = await fetch(`/orders/${orderId}/status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'CANCELLED' })
    });
    const data = await res.json();
    if (data.success) { loadOrders(); }
    else { alert(data.message || 'Failed to cancel order.'); }
  } catch (_) { alert('An error occurred.'); }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
