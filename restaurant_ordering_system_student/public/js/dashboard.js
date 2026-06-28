// public/js/dashboard.js
// Drives the admin dashboard page.
// All data comes from GET /api/dashboard → DashboardController.index
//                                        → SaleOrder.getSummary()
//                                        → get_sale_order_summary() [SQL function]

document.addEventListener('DOMContentLoaded', function () {
    loadDashboardData();
    setupFilterForm();
});

// ── Load dashboard data from the API ────────────────────────────────────────
function loadDashboardData() {
    const urlParams = new URLSearchParams(window.location.search);

    fetch(`/api/dashboard?${urlParams.toString()}`)
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                showDashboardError(data.message || 'Failed to load dashboard data.');
                return;
            }
            hideDashboardError();
            updateUserWelcome(data.user);
            updateStatCards(data.stats);
            populateCategories(data.categories);
            restoreFilters(data.filters);
            displayOrders(data.orders);
        })
        .catch(() => showDashboardError('Could not connect to the server.'));
}

// ── Stat cards ───────────────────────────────────────────────────────────────
// Reflects the FILTERED result set so stats always match what is shown in the table.
function updateStatCards(stats) {
    if (!stats) return;
    document.getElementById('stat-total-orders').textContent = stats.totalOrders;
    document.getElementById('stat-revenue').textContent =
        '$' + parseFloat(stats.totalRevenue).toFixed(2);
    document.getElementById('stat-packing').textContent   = stats.statusCounts.PACKING;
    document.getElementById('stat-cancelled').textContent = stats.statusCounts.CANCELLED;
}

// ── Order table ──────────────────────────────────────────────────────────────
function displayOrders(orders) {
    const tbody          = document.getElementById('orders-tbody');
    const noOrders       = document.getElementById('no-orders');
    const tableContainer = document.getElementById('orders-table-container');
    const title          = document.getElementById('order-summary-title');

    title.textContent = `Order Summary (${orders.length} order${orders.length !== 1 ? 's' : ''})`;

    if (orders.length === 0) {
        tableContainer.style.display = 'none';
        noOrders.style.display = 'block';
        return;
    }

    tableContainer.style.display = 'block';
    noOrders.style.display = 'none';

    tbody.innerHTML = orders.map(order => `
        <tr id="order-row-${order.order_id}">
            <td>#${order.order_id}</td>
            <td>${escapeHtml(order.customer_name)}</td>
            <td>${formatDate(order.order_date)}</td>
            <td>$${parseFloat(order.total_amount).toFixed(2)}</td>
            <td>
                <span class="badge bg-${getStatusBadgeClass(order.status)}"
                      id="badge-${order.order_id}">
                    ${order.status}
                </span>
            </td>
            <td>${order.product_count}</td>
            <td>${escapeHtml(order.products_ordered || '—')}</td>
            <td>
                <div class="d-flex gap-1 align-items-center">
                    <select class="form-select form-select-sm"
                            id="status-select-${order.order_id}"
                            style="width:130px;">
                        <option value="PACKING"
                            ${order.status === 'PACKING'   ? 'selected' : ''}>PACKING</option>
                        <option value="COMPLETED"
                            ${order.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
                        <option value="CANCELLED"
                            ${order.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                    </select>
                    <button class="btn btn-sm btn-primary"
                            onclick="updateOrderStatus(${order.order_id})">Save</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ── Update a single order's status ──────────────────────────────────────────
// PUT /orders/:id/status → OrderController.updateStatus
// Admin bypass: controller allows any status change for ADMIN role.
async function updateOrderStatus(orderId) {
    const select    = document.getElementById(`status-select-${orderId}`);
    const newStatus = select.value;

    try {
        const res  = await fetch(`/orders/${orderId}/status`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ status: newStatus })
        });
        const data = await res.json();

        if (data.success) {
            // Update badge in place — no full reload needed
            const badge = document.getElementById(`badge-${orderId}`);
            if (badge) {
                badge.className   = `badge bg-${getStatusBadgeClass(newStatus)}`;
                badge.textContent = newStatus;
            }
        } else {
            alert(data.message || 'Failed to update order status.');
        }
    } catch (_) {
        alert('An error occurred while updating the order.');
    }
}

// ── Filter form ──────────────────────────────────────────────────────────────
function setupFilterForm() {
    const form = document.getElementById('filter-form');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(form).entries()) {
            if (value.trim()) params.append(key, value);
        }
        window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
        loadDashboardData();
    });
}

function clearFilters() {
    document.getElementById('start_date').value = '';
    document.getElementById('end_date').value   = '';
    document.getElementById('category').value   = '';
    document.getElementById('status').value     = '';
    document.getElementById('sort_by').value    = 'order_date';
    document.getElementById('sort_order').value = 'DESC';
    window.history.pushState({}, '', window.location.pathname);
    loadDashboardData();
}

// Restore filter inputs to match what the API actually used
// (handles browser back/forward and direct URL entry)
function restoreFilters(filters) {
    if (!filters) return;
    if (filters.start_date) document.getElementById('start_date').value = filters.start_date;
    if (filters.end_date)   document.getElementById('end_date').value   = filters.end_date;
    if (filters.category)   document.getElementById('category').value   = filters.category;
    if (filters.status)     document.getElementById('status').value     = filters.status;
    if (filters.sort_by)    document.getElementById('sort_by').value    = filters.sort_by;
    if (filters.sort_order) document.getElementById('sort_order').value = filters.sort_order;
}

// Populate category dropdown from the API response
// Guard against adding duplicates on repeated loads
function populateCategories(categories) {
    const select = document.getElementById('category');
    // Remove everything except the first "All Categories" option
    while (select.options.length > 1) select.remove(1);
    (categories || []).forEach(cat => {
        const opt = document.createElement('option');
        opt.value       = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
    // Re-apply selected value if a filter is active
    const params = new URLSearchParams(window.location.search);
    if (params.get('category')) select.value = params.get('category');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function updateUserWelcome(user) {
    const el = document.getElementById('user-welcome');
    if (el && user) el.textContent = `Welcome, ${user.name} (Admin)`;
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'COMPLETED': return 'success';
        case 'CANCELLED': return 'danger';
        case 'PACKING':   return 'warning text-dark';
        default:          return 'secondary';
    }
}

function showDashboardError(msg) {
    const el = document.getElementById('dashboard-error');
    if (!el) return;
    el.textContent   = msg;
    el.style.display = 'block';
}

function hideDashboardError() {
    const el = document.getElementById('dashboard-error');
    if (el) el.style.display = 'none';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Reload on browser back/forward
window.addEventListener('popstate', loadDashboardData);
