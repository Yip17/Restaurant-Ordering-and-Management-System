// public/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    setupFilterForm();
});

function loadDashboardData() {
    const urlParams = new URLSearchParams(window.location.search);

    fetch(`/api/dashboard?${urlParams.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayOrders(data.orders);
                populateCategories(data.categories);
                updateFilters(data.filters);
                updateUserWelcome(data.user);
            } else {
                console.error('Error loading dashboard data:', data.message);
            }
        })
        .catch(error => console.error('Error:', error));
}

function displayOrders(orders) {
    const tbody          = document.getElementById('orders-tbody');
    const noOrders       = document.getElementById('no-orders');
    const tableContainer = document.getElementById('orders-table-container');
    const title          = document.getElementById('order-summary-title');

    title.textContent = `Order Summary (${orders.length} orders)`;

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
            <td>${order.customer_name}</td>
            <td>${formatDate(order.order_date)}</td>
            <td>$${parseFloat(order.total_amount).toFixed(2)}</td>
            <td>
                <span class="badge bg-${getStatusBadgeClass(order.status)}" id="badge-${order.order_id}">
                    ${order.status}
                </span>
            </td>
            <td>${order.product_count}</td>
            <td>${order.products_ordered}</td>
            <td>
                <div class="d-flex gap-1 align-items-center">
                    <select class="form-select form-select-sm" id="status-select-${order.order_id}"
                            style="width:130px;">
                        <option value="PACKING"   ${order.status === 'PACKING'   ? 'selected' : ''}>PACKING</option>
                        <option value="COMPLETED" ${order.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
                        <option value="CANCELLED" ${order.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                    </select>
                    <button class="btn btn-sm btn-primary"
                            onclick="updateOrderStatus(${order.order_id})">Save</button>
                </div>
            </td>
        </tr>
    `).join('');
}

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
            const badge = document.getElementById(`badge-${orderId}`);
            if (badge) {
                badge.className   = `badge bg-${getStatusBadgeClass(newStatus)}`;
                badge.textContent = newStatus;
            }
        } else {
            alert(data.message || 'Failed to update status.');
        }
    } catch (_) {
        alert('An error occurred.');
    }
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'COMPLETED': return 'success';
        case 'CANCELLED': return 'danger';
        case 'PACKING':   return 'warning';
        default:          return 'secondary';
    }
}

function populateCategories(categories) {
    const select = document.getElementById('category');
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
}

function updateFilters(filters) {
    if (filters.start_date) document.getElementById('start_date').value = filters.start_date;
    if (filters.end_date)   document.getElementById('end_date').value   = filters.end_date;
    if (filters.category)   document.getElementById('category').value   = filters.category;
    if (filters.sort_by)    document.getElementById('sort_by').value    = filters.sort_by;
    if (filters.sort_order) document.getElementById('sort_order').value = filters.sort_order;
}

function setupFilterForm() {
    const form = document.getElementById('filter-form');
    form.addEventListener('submit', function(e) {
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
    document.getElementById('sort_by').value    = 'order_date';
    document.getElementById('sort_order').value = 'DESC';
    window.history.pushState({}, '', window.location.pathname);
    loadDashboardData();
}

function updateUserWelcome(user) {
    const el = document.getElementById('user-welcome');
    if (el && user) el.textContent = `Welcome, ${user.name}`;
}

window.addEventListener('popstate', loadDashboardData);
