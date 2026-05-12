// public/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    setupFilterForm();
});

function loadDashboardData() {
    const urlParams = new URLSearchParams(window.location.search);
    const filters = Object.fromEntries(urlParams);
    
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
        .catch(error => {
            console.error('Error:', error);
        });
}

function displayOrders(orders) {
    const tbody = document.getElementById('orders-tbody');
    const noOrders = document.getElementById('no-orders');
    const tableContainer = document.getElementById('orders-table-container');
    const title = document.getElementById('order-summary-title');
    
    title.textContent = `Order Summary (${orders.length} orders)`;
    
    if (orders.length === 0) {
        tableContainer.style.display = 'none';
        noOrders.style.display = 'block';
        return;
    }
    
    tableContainer.style.display = 'block';
    noOrders.style.display = 'none';
    
    const ordersHTML = orders.map(order => `
        <tr>
            <td>#${order.order_id}</td>
            <td>${order.customer_name}</td>
            <td>${formatDate(order.order_date)}</td>
            <td>$${parseFloat(order.total_amount).toFixed(2)}</td>
            <td>
                <span class="badge bg-${getStatusBadgeClass(order.status)}">
                    ${order.status}
                </span>
            </td>
            <td>${order.product_count}</td>
            <td>${order.products_ordered}</td>
        </tr>
    `).join('');
    
    tbody.innerHTML = ordersHTML;
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'COMPLETED': return 'success';
        case 'CANCELLED': return 'danger';
        case 'PENDING': return 'warning';
        case 'PROCESSING': return 'info';
        default: return 'secondary';
    }
}

function populateCategories(categories) {
    const categorySelect = document.getElementById('category');
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
}

function updateFilters(filters) {
    if (filters.startDate) document.getElementById('start_date').value = filters.startDate;
    if (filters.endDate) document.getElementById('end_date').value = filters.endDate;
    if (filters.productCategory) document.getElementById('category').value = filters.productCategory;
    if (filters.sortBy) document.getElementById('sort_by').value = filters.sortBy;
    if (filters.sortOrder) document.getElementById('sort_order').value = filters.sortOrder;
}

function setupFilterForm() {
    const form = document.getElementById('filter-form');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const params = new URLSearchParams();
        
        for (const [key, value] of formData.entries()) {
            if (value.trim() !== '') {
                params.append(key, value);
            }
        }
        
        // Update URL and reload data
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({}, '', newUrl);
        loadDashboardData();
    });
}

function clearFilters() {
    // Clear all form fields
    document.getElementById('start_date').value = '';
    document.getElementById('end_date').value = '';
    document.getElementById('category').value = '';
    document.getElementById('sort_by').value = 'order_date';
    document.getElementById('sort_order').value = 'DESC';
    
    // Update URL and reload data
    window.history.pushState({}, '', window.location.pathname);
    loadDashboardData();
}

function updateUserWelcome(user) {
    const welcomeElement = document.getElementById('user-welcome');
    if (welcomeElement && user) {
        welcomeElement.textContent = `Welcome, ${user.name}`;
    }
}

// Handle browser back/forward buttons
window.addEventListener('popstate', function() {
    loadDashboardData();
});