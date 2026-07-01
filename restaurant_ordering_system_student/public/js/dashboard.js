// public/js/dashboard.js
// Drives the admin dashboard page.

// Wraps fetchMethod in a Promise so async/await flow is preserved.
// Resolves with { status, data } — status is the HTTP code, data is the JSON body.
function apiFetch(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    fetchMethod(url, (status, data) => resolve({ status, data }), method, body);
  });
}

document.addEventListener('DOMContentLoaded', function () {
    loadDashboardData();
    setupFilterForm();
});

function loadDashboardData() {
    const urlParams = new URLSearchParams(window.location.search);

    fetchMethod(`/api/dashboard?${urlParams.toString()}`, (status, data) => {
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
        loadProductFeedback(data.filters.category || null);
    });
}

function updateStatCards(stats) {
    if (!stats) return;
    document.getElementById('stat-total-orders').textContent = stats.totalOrders;
    document.getElementById('stat-revenue').textContent =
        '$' + parseFloat(stats.totalRevenue).toFixed(2);
    document.getElementById('stat-packing').textContent   = stats.statusCounts.PACKING;
    document.getElementById('stat-cancelled').textContent = stats.statusCounts.CANCELLED;
}

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

function updateOrderStatus(orderId) {
    const select    = document.getElementById(`status-select-${orderId}`);
    const newStatus = select.value;

    fetchMethod(
        `/orders/${orderId}/status`,
        (status, data) => {
            if (data.success) {
                const badge = document.getElementById(`badge-${orderId}`);
                if (badge) {
                    badge.className   = `badge bg-${getStatusBadgeClass(newStatus)}`;
                    badge.textContent = newStatus;
                }
            } else {
                alert(data.message || 'Failed to update order status.');
            }
        },
        'PUT',
        { status: newStatus }
    );
}

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

function restoreFilters(filters) {
    if (!filters) return;
    if (filters.start_date) document.getElementById('start_date').value = filters.start_date;
    if (filters.end_date)   document.getElementById('end_date').value   = filters.end_date;
    if (filters.category)   document.getElementById('category').value   = filters.category;
    if (filters.status)     document.getElementById('status').value     = filters.status;
    if (filters.sort_by)    document.getElementById('sort_by').value    = filters.sort_by;
    if (filters.sort_order) document.getElementById('sort_order').value = filters.sort_order;
}

function populateCategories(categories) {

    // Get the dropdown menu
    const select = document.getElementById("category");

    // Remove all options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Add each category to the dropdown
    if (categories) {
        for (let i = 0; i < categories.length; i++) {

            const option = document.createElement("option");

            option.value = categories[i];
            option.textContent = categories[i];

            select.appendChild(option);
        }
    }

    // Read the URL parameters
    const params = new URLSearchParams(window.location.search);

    // Get the category from the URL
    const selectedCategory = params.get("category");

    // If a category exists, select it
    if (selectedCategory !== null) {
        select.value = selectedCategory;
    }
}

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
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.addEventListener('popstate', loadDashboardData);

// =============================================================================
// PRODUCT FEEDBACK SECTION
// =============================================================================

async function loadProductFeedback(category) {
    const section  = document.getElementById('feedback-section');
    const loading  = document.getElementById('feedback-loading');
    const errEl    = document.getElementById('feedback-section-error');
    const noFbEl   = document.getElementById('no-product-feedback');
    const listEl   = document.getElementById('product-feedback-list');
    const titleEl  = document.getElementById('feedback-section-title');

    if (!category) {
        section.style.display = 'none';
        return;
    }

    section.style.display   = 'block';
    loading.style.display   = 'block';
    errEl.style.display     = 'none';
    noFbEl.style.display    = 'none';
    listEl.innerHTML        = '';
    titleEl.textContent     = `Product Feedback — ${category}`;

    const { data } = await apiFetch(
        `/api/dashboard/product-feedback?category=${encodeURIComponent(category)}`
    );

    loading.style.display = 'none';

    if (!data.success) {
        errEl.textContent   = data.message || 'Failed to load feedback.';
        errEl.style.display = 'block';
        return;
    }

    //redundant
    if (!data.product) {
        noFbEl.textContent   = `No product found for category "${escapeHtml(category)}".`;
        noFbEl.style.display = 'block';
        return;
    }

    titleEl.textContent = `Product Feedback — ${escapeHtml(data.product.name)} (${escapeHtml(category)})`;
    renderAvailabilityToggle(data.product);

    if (!data.feedback || data.feedback.length === 0) {
        noFbEl.style.display = 'block';
        return;
    }

    const { data: authData } = await apiFetch('/api/auth/status');
    const adminId = authData.authenticated ? authData.user.id : null;

    data.feedback.forEach(fb => {
        listEl.appendChild(buildAdminFeedbackCard(fb, adminId));
    });
}

// =============================================================================
// PRODUCT AVAILABILITY TOGGLE
// =============================================================================

let _currentProduct = null;

function renderAvailabilityToggle(product) {
    _currentProduct = product;

    const badge = document.getElementById('product-availability-badge');
    const btn   = document.getElementById('toggle-availability-btn');

    if (product.is_available) {
        badge.textContent = 'Available';
        badge.className   = 'badge bg-success';
        btn.textContent   = 'Mark Unavailable';
        btn.className     = 'btn btn-sm btn-outline-danger';
    } else {
        badge.textContent = 'Unavailable';
        badge.className   = 'badge bg-secondary';
        btn.textContent   = 'Mark Available';
        btn.className     = 'btn btn-sm btn-outline-success';
    }

    btn.style.display = '';
}

async function toggleProductAvailability() {
    if (!_currentProduct) return;

    const btn      = document.getElementById('toggle-availability-btn');
    const newValue = !_currentProduct.is_available;
    const label    = newValue ? 'available' : 'unavailable';

    if (!confirm(`Mark "${escapeHtml(_currentProduct.name)}" as ${label}?`)) return;

    btn.disabled = true;

    const { data } = await apiFetch(
        '/api/dashboard/product-availability',
        'PATCH',
        { product_id: _currentProduct.product_id, is_available: newValue }
    );

    if (data.success) {
        renderAvailabilityToggle(data.product);
    } else {
        alert(data.message || 'Failed to update product availability.');
    }

    btn.disabled = false;
}

function buildAdminFeedbackCard(fb, adminId) {
    const card = document.createElement('div');
    card.className = 'card mb-3 border-start border-3 border-info';
    card.id = `admin-fb-card-${fb.feedback_id}`;

    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += `<span class="${i <= fb.rating ? 'text-warning' : 'text-muted'}">★</span>`;
    }

    const responsesHtml = buildResponsesHtml(fb.responses || [], adminId, fb.feedback_id);

    card.innerHTML = `
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-1">
                <div>
                    <span class="fw-semibold me-2">${escapeHtml(fb.username || 'Member')}</span>
                    <span>${stars}</span>
                    <small class="text-muted ms-2">${new Date(fb.created_at).toLocaleString()}</small>
                </div>
                <span class="badge bg-secondary">Feedback #${fb.feedback_id}</span>
            </div>
            <p class="mb-2 mt-1">${escapeHtml(fb.comment || '')}</p>
            <div id="admin-responses-${fb.feedback_id}"
                 class="ms-3 border-start border-2 ps-3 mb-2">
                ${responsesHtml}
            </div>
            <div class="mt-2">
                <label class="form-label small text-muted fw-semibold">Admin Follow-up Response</label>
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control"
                           id="admin-resp-input-${fb.feedback_id}"
                           placeholder="Write a follow-up response…" maxlength="500">
                    <button class="btn btn-outline-primary"
                            onclick="adminSubmitResponse(${fb.feedback_id})">Send</button>
                </div>
                <div id="admin-resp-error-${fb.feedback_id}"
                     class="text-danger mt-1" style="font-size:0.85rem;"></div>
            </div>
        </div>`;

    return card;
}

function buildResponsesHtml(responses, adminId, feedbackId) {
    if (!responses || responses.length === 0) {
        return '<small class="text-muted">No responses yet.</small>';
    }
    return responses.map(r => {
        const isAdminOwn = adminId && Number(r.member_id) === Number(adminId);
        return `
            <div class="d-flex justify-content-between align-items-start mb-1"
                 id="admin-resp-row-${r.response_id}">
                <div>
                    <span class="fw-semibold me-1" style="font-size:0.9rem;">
                        ${escapeHtml(r.username || 'Member')}:
                    </span>
                    <span style="font-size:0.9rem;">${escapeHtml(r.response_text)}</span>
                    <small class="text-muted ms-1">${new Date(r.created_at).toLocaleString()}</small>
                </div>
                ${isAdminOwn ? `
                    <button class="btn btn-link btn-sm text-danger p-0 ms-2"
                            onclick="adminDeleteResponse(${r.response_id}, ${feedbackId})">
                        Delete
                    </button>` : ''}
            </div>`;
    }).join('');
}

async function adminSubmitResponse(feedbackId) {
    const input   = document.getElementById(`admin-resp-input-${feedbackId}`);
    const errorEl = document.getElementById(`admin-resp-error-${feedbackId}`);
    const text    = input.value.trim();

    errorEl.textContent = '';
    if (!text) { errorEl.textContent = 'Response cannot be empty.'; return; }

    const { data } = await apiFetch(
        `/feedback/${feedbackId}/responses`,
        'POST',
        { response_text: text }
    );

    if (data.success) {
        input.value = '';
        await refreshAdminResponses(feedbackId);
    } else {
        errorEl.textContent = data.message || 'Failed to submit response.';
    }
}

async function adminDeleteResponse(responseId, feedbackId) {
    if (!confirm('Delete this response?')) return;
    const { data } = await apiFetch(`/feedback/responses/${responseId}`, 'DELETE');
    if (data.success) {
        await refreshAdminResponses(feedbackId);
    } else {
        alert(data.message || 'Failed to delete response.');
    }
}

async function refreshAdminResponses(feedbackId) {
    const container = document.getElementById(`admin-responses-${feedbackId}`);
    if (!container) return;

    const { data: authData } = await apiFetch('/api/auth/status');
    const adminId = authData.authenticated ? authData.user.id : null;

    const { data } = await apiFetch(`/feedback/${feedbackId}/responses`);
    container.innerHTML = buildResponsesHtml(
        data.success ? data.responses : [],
        adminId,
        feedbackId
    );
}
