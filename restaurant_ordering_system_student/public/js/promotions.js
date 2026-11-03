// public/js/promotions.js — admin promotion CRUD

function apiFetch(url, method, body) {
  return new Promise(resolve =>
    fetchMethod(url, (status, data) => resolve(data), method || 'GET', body || null)
  );
}

let allRules = [];
let products = [];
let editingRuleId = null;
let pendingDeleteId = null;

let ruleModal;
let deleteModal;

document.addEventListener('DOMContentLoaded', async () => {
  ruleModal   = new bootstrap.Modal(document.getElementById('ruleModal'));
  deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));

  const auth = await apiFetch('/api/auth/status');
  if (!auth.authenticated || auth.user.role !== 'ADMIN') {
    window.location.href = '/login';
    return;
  }
  document.getElementById('user-welcome').textContent = `Welcome, ${auth.user.name}`;

  await loadProducts();
  await loadRules();
});

async function loadProducts() {
  const data = await apiFetch('/api/promotions/products');
  if (data.success) products = data.products || [];
}

async function loadRules() {
  const data = await apiFetch('/api/promotions');
  if (!data.success) {
    showPageMsg('Failed to load promotions.', 'danger');
    return;
  }
  allRules = data.rules || [];
  renderTables();
}

function renderTables() {
  renderProductRules(allRules.filter(r => r.discountType === 'QUANTITY_PRODUCT'));
  renderCartRules(allRules.filter(r => r.discountType === 'CART_VALUE'));
  renderDeliveryRules(allRules.filter(r => r.discountType === 'DELIVERY_TIERED'));
}

function renderProductRules(rules) {
  const tbody = document.getElementById('product-rules-tbody');
  if (rules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No product discounts yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rules.map(r => `
    <tr>
      <td class="ps-3">${esc(r.product?.name || '—')}</td>
      <td>${Number(r.thresholdValue)}</td>
      <td>${Number(r.discountPercent)}%</td>
      <td>${esc(r.description || '—')}</td>
      <td>${activeBadge(r.isActive)}</td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(${r.ruleId})">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="openDeleteModal(${r.ruleId})">Delete</button>
      </td>
    </tr>`).join('');
}

function renderCartRules(rules) {
  const tbody = document.getElementById('cart-rules-tbody');
  if (rules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No cart value discounts yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rules.map(r => `
    <tr>
      <td class="ps-3">$${fmt(r.thresholdValue)}</td>
      <td>${Number(r.discountPercent)}%</td>
      <td>${esc(r.description || '—')}</td>
      <td>${activeBadge(r.isActive)}</td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(${r.ruleId})">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="openDeleteModal(${r.ruleId})">Delete</button>
      </td>
    </tr>`).join('');
}

function renderDeliveryRules(rules) {
  const tbody = document.getElementById('delivery-rules-tbody');
  if (rules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No delivery tiers yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rules.map(r => `
    <tr>
      <td class="ps-3">$${fmt(r.thresholdValue)}</td>
      <td>${Number(r.deliveryFee) === 0 ? 'FREE' : '$' + fmt(r.deliveryFee)}</td>
      <td>${esc(r.description || '—')}</td>
      <td>${activeBadge(r.isActive)}</td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(${r.ruleId})">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="openDeleteModal(${r.ruleId})">Delete</button>
      </td>
    </tr>`).join('');
}

function activeBadge(active) {
  return active
    ? '<span class="badge bg-success">Active</span>'
    : '<span class="badge bg-secondary">Inactive</span>';
}

function openCreateModal() {
  editingRuleId = null;
  document.getElementById('ruleModalTitle').textContent = 'Add Promotion';
  document.getElementById('field-type').style.display = '';
  document.getElementById('discountType').disabled = false;
  document.getElementById('modal-error').style.display = 'none';
  document.getElementById('thresholdValue').value = '';
  document.getElementById('discountPercent').value = '';
  document.getElementById('deliveryFee').value = '';
  document.getElementById('description').value = '';
  document.getElementById('isActive').checked = true;

  populateProductSelect();
  document.getElementById('discountType').value = 'QUANTITY_PRODUCT';
  onTypeChange();
  ruleModal.show();
}

function openEditModal(ruleId) {
  const rule = allRules.find(r => r.ruleId === ruleId);
  if (!rule) return;

  editingRuleId = ruleId;
  document.getElementById('ruleModalTitle').textContent = 'Edit Promotion';
  document.getElementById('field-type').style.display = 'none';
  document.getElementById('modal-error').style.display = 'none';
  document.getElementById('discountType').value = rule.discountType;
  document.getElementById('discountType').disabled = true;
  document.getElementById('thresholdValue').value = Number(rule.thresholdValue);
  document.getElementById('discountPercent').value = Number(rule.discountPercent);
  document.getElementById('deliveryFee').value = Number(rule.deliveryFee);
  document.getElementById('description').value = rule.description || '';
  document.getElementById('isActive').checked = rule.isActive;

  populateProductSelect(rule.productId);
  onTypeChange();
  if (rule.discountType === 'QUANTITY_PRODUCT') {
    document.getElementById('field-product').style.display = '';
    document.getElementById('productId').disabled = true;
  }
  ruleModal.show();
}

function populateProductSelect(selectedId) {
  const sel = document.getElementById('productId');
  sel.innerHTML = products.map(p =>
    `<option value="${p.productId}" ${p.productId === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');
}

function onTypeChange() {
  const type = document.getElementById('discountType').value;

  document.getElementById('field-product').style.display = type === 'QUANTITY_PRODUCT' ? '' : 'none';
  document.getElementById('field-percent').style.display = type === 'DELIVERY_TIERED' ? 'none' : '';
  document.getElementById('field-fee').style.display = type === 'DELIVERY_TIERED' ? '' : 'none';

  const thresholdLabel = document.getElementById('threshold-label');
  if (type === 'QUANTITY_PRODUCT') thresholdLabel.textContent = 'Minimum Quantity';
  else if (type === 'CART_VALUE')  thresholdLabel.textContent = 'Minimum Cart Value ($)';
  else                             thresholdLabel.textContent = 'Minimum Order Value ($)';

  document.getElementById('productId').disabled = false;
}

async function saveRule() {
  const type = document.getElementById('discountType').value;
  const payload = {
    thresholdValue: document.getElementById('thresholdValue').value,
    description:    document.getElementById('description').value,
    isActive:       document.getElementById('isActive').checked
  };

  if (type !== 'DELIVERY_TIERED') {
    payload.discountPercent = document.getElementById('discountPercent').value;
  } else {
    payload.deliveryFee = document.getElementById('deliveryFee').value;
  }

  let data;
  if (editingRuleId) {
    data = await apiFetch(`/api/promotions/${editingRuleId}`, 'PUT', payload);
  } else {
    payload.discountType = type;
    if (type === 'QUANTITY_PRODUCT') {
      payload.productId = parseInt(document.getElementById('productId').value);
    }
    data = await apiFetch('/api/promotions', 'POST', payload);
  }

  if (!data.success) {
    const errEl = document.getElementById('modal-error');
    errEl.textContent = data.message || 'Save failed.';
    errEl.style.display = 'block';
    return;
  }

  ruleModal.hide();
  showPageMsg(editingRuleId ? 'Promotion updated.' : 'Promotion created.', 'success');
  await loadRules();
}

function openDeleteModal(ruleId) {
  pendingDeleteId = ruleId;
  deleteModal.show();
}

async function confirmDelete() {
  const data = await apiFetch(`/api/promotions/${pendingDeleteId}`, 'DELETE', {});
  deleteModal.hide();
  if (!data.success) {
    showPageMsg(data.message || 'Delete failed.', 'danger');
    return;
  }
  showPageMsg('Promotion deleted.', 'success');
  await loadRules();
}

function showPageMsg(msg, type) {
  const el = document.getElementById('page-msg');
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function fmt(n) { return Number(n).toFixed(2); }

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
