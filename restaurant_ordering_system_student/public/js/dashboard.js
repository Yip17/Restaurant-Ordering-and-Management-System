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
            // Load product feedback when a category filter is active
            loadProductFeedback(data.filters.category || null);
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

// =============================================================================
// PRODUCT FEEDBACK SECTION
// Shown when admin filters by category. Loads all feedback for the matching
// product and lets the admin post follow-up responses.
//
// Flow:
//   GET /api/dashboard/product-feedback?category=X
//     → resolves product_id from category
//     → SELECT * FROM get_feedback_by_product(product_id)
//     → for each feedback: SELECT * FROM get_response(feedback_id)
//   POST /feedback/:feedbackId/responses
//     → CALL create_response(feedbackId, adminMemberId, text, NULL)
//     → procedure allows any member who is NOT the feedback author to respond
//   DELETE /feedback/responses/:id
//     → CALL delete_response(responseId, adminMemberId)
//     → procedure validates admin owns that response
// =============================================================================

async function loadProductFeedback(category) {
    const section    = document.getElementById('feedback-section');
    const loading    = document.getElementById('feedback-loading');
    const errEl      = document.getElementById('feedback-section-error');
    const noFbEl     = document.getElementById('no-product-feedback');
    const listEl     = document.getElementById('product-feedback-list');
    const titleEl    = document.getElementById('feedback-section-title');

    // Hide section entirely when no category is selected
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

    try {
        const res  = await fetch(`/api/dashboard/product-feedback?category=${encodeURIComponent(category)}`);
        const data = await res.json();

        loading.style.display = 'none';

        if (!data.success) {
            errEl.textContent   = data.message || 'Failed to load feedback.';
            errEl.style.display = 'block';
            return;
        }

        if (!data.product) {
            noFbEl.textContent   = `No product found for category "${escapeHtml(category)}".`;
            noFbEl.style.display = 'block';
            return;
        }

        titleEl.textContent = `Product Feedback — ${escapeHtml(data.product.name)} (${escapeHtml(category)})`;

        // Render availability toggle with current state
        renderAvailabilityToggle(data.product);

        if (!data.feedback || data.feedback.length === 0) {
            noFbEl.style.display = 'block';
            return;
        }

        // Get current admin's member ID for response ownership checks
        const authRes  = await fetch('/api/auth/status');
        const authData = await authRes.json();
        const adminId  = authData.authenticated ? authData.user.id : null;

        data.feedback.forEach(fb => {
            listEl.appendChild(buildAdminFeedbackCard(fb, adminId));
        });

    } catch (_) {
        loading.style.display = 'none';
        errEl.textContent     = 'Failed to load product feedback.';
        errEl.style.display   = 'block';
    }
}

// =============================================================================
// PRODUCT AVAILABILITY TOGGLE
// Admin can mark a product Available / Unavailable from the dashboard.
// When unavailable, SaleOrder.create() blocks new orders server-side because
// it checks is_available = true — no extra gate needed in the front-end.
// =============================================================================

// Tracks the currently displayed product so the toggle button knows which ID to patch.
let _currentProduct = null;

// Render the availability badge and toggle button with the product's current state.
function renderAvailabilityToggle(product) {
    _currentProduct = product;

    const badge  = document.getElementById('product-availability-badge');
    const btn    = document.getElementById('toggle-availability-btn');

    if (product.is_available) {
        badge.textContent  = 'Available';
        badge.className    = 'badge bg-success';
        btn.textContent    = 'Mark Unavailable';
        btn.className      = 'btn btn-sm btn-outline-danger';
    } else {
        badge.textContent  = 'Unavailable';
        badge.className    = 'badge bg-secondary';
        btn.textContent    = 'Mark Available';
        btn.className      = 'btn btn-sm btn-outline-success';
    }

    btn.style.display = '';
}

// PATCH /api/dashboard/product-availability
// Flips is_available and refreshes the badge + button without reloading the page.
async function toggleProductAvailability() {
    if (!_currentProduct) return;

    const btn        = document.getElementById('toggle-availability-btn');
    const newValue   = !_currentProduct.is_available;
    const label      = newValue ? 'available' : 'unavailable';

    if (!confirm(`Mark "${escapeHtml(_currentProduct.name)}" as ${label}?`)) return;

    btn.disabled = true;

    try {
        const res  = await fetch('/api/dashboard/product-availability', {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                product_id:   _currentProduct.product_id,
                is_available: newValue
            })
        });
        const data = await res.json();

        if (data.success) {
            // Update local state and re-render the badge/button
            renderAvailabilityToggle(data.product);
        } else {
            alert(data.message || 'Failed to update product availability.');
        }
    } catch (_) {
        alert('An error occurred.');
    }

    btn.disabled = false;
}

// Build a single feedback card for the admin view.
// Shows full feedback detail, all responses, and a follow-up response form.
function buildAdminFeedbackCard(fb, adminId) {
    const card = document.createElement('div');
    card.className = 'card mb-3 border-start border-3 border-info';
    card.id = `admin-fb-card-${fb.feedback_id}`;

    // Build star display
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += `<span class="${i <= fb.rating ? 'text-warning' : 'text-muted'}">★</span>`;
    }

    // Build responses HTML
    const responsesHtml = buildResponsesHtml(fb.responses || [], adminId, fb.feedback_id);

    // Admin is never the feedback author (different role), so the response form
    // is always shown. The create_response procedure enforces this at DB level too.
    card.innerHTML = `
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-1">
                <div>
                    <span class="fw-semibold me-2">${escapeHtml(fb.username || 'Member')}</span>
                    <span>${stars}</span>
                    <small class="text-muted ms-2">${new Date(fb.created_at).toLocaleDateString()}</small>
                    ${fb.updated_at ? `<small class="text-muted ms-1">(edited ${new Date(fb.updated_at).toLocaleDateString()})</small>` : ''}
                </div>
                <span class="badge bg-secondary">Feedback #${fb.feedback_id}</span>
            </div>

            <p class="mb-2 mt-1">${escapeHtml(fb.comment || '')}</p>

            <!-- Responses -->
            <div id="admin-responses-${fb.feedback_id}"
                 class="ms-3 border-start border-2 ps-3 mb-2">
                ${responsesHtml}
            </div>

            <!-- Admin follow-up response form -->
            <div class="mt-2">
                <label class="form-label small text-muted fw-semibold">Admin Follow-up Response</label>
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control"
                           id="admin-resp-input-${fb.feedback_id}"
                           placeholder="Write a follow-up response…"
                           maxlength="500">
                    <button class="btn btn-outline-primary"
                            onclick="adminSubmitResponse(${fb.feedback_id})">Send</button>
                </div>
                <div id="admin-resp-error-${fb.feedback_id}"
                     class="text-danger mt-1" style="font-size:0.85rem;"></div>
            </div>
        </div>`;

    return card;
}

// Build the HTML for all responses inside a feedback card.
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
                    <small class="text-muted ms-1">${new Date(r.created_at).toLocaleDateString()}</small>
                </div>
                ${isAdminOwn ? `
                    <button class="btn btn-link btn-sm text-danger p-0 ms-2"
                            onclick="adminDeleteResponse(${r.response_id}, ${feedbackId})">
                        Delete
                    </button>` : ''}
            </div>`;
    }).join('');
}

// POST /feedback/:feedbackId/responses
// Admin submits a follow-up response to a feedback entry.
// The create_response procedure validates that admin is not the feedback author.
async function adminSubmitResponse(feedbackId) {
    const input   = document.getElementById(`admin-resp-input-${feedbackId}`);
    const errorEl = document.getElementById(`admin-resp-error-${feedbackId}`);
    const text    = input.value.trim();

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
            // Reload the responses block for this card
            await refreshAdminResponses(feedbackId);
        } else {
            errorEl.textContent = data.message || 'Failed to submit response.';
        }
    } catch (_) {
        errorEl.textContent = 'An error occurred.';
    }
}

// DELETE /feedback/responses/:id
// Admin deletes their own response.
async function adminDeleteResponse(responseId, feedbackId) {
    if (!confirm('Delete this response?')) return;
    try {
        const res  = await fetch(`/feedback/responses/${responseId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            await refreshAdminResponses(feedbackId);
        } else {
            alert(data.message || 'Failed to delete response.');
        }
    } catch (_) {
        alert('An error occurred.');
    }
}

// Reload the responses block for a single feedback card after a change.
async function refreshAdminResponses(feedbackId) {
    const container = document.getElementById(`admin-responses-${feedbackId}`);
    if (!container) return;

    try {
        const authRes  = await fetch('/api/auth/status');
        const authData = await authRes.json();
        const adminId  = authData.authenticated ? authData.user.id : null;

        const res  = await fetch(`/feedback/${feedbackId}/responses`);
        const data = await res.json();

        container.innerHTML = buildResponsesHtml(
            data.success ? data.responses : [],
            adminId,
            feedbackId
        );
    } catch (_) {
        container.innerHTML = '<small class="text-danger">Could not reload responses.</small>';
    }
}
