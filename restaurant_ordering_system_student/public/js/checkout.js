// public/js/checkout.js — drives checkout.html
//
// Flow:
//   1. On load: fetch summary + available-discounts in parallel.
//   2. Delivery/pickup toggle re-fetches only the summary.
//   3. Applied-discounts card shows what actually fired.
//   4. Available-promotions panel shows 🔒/✅ per rule based on current cart state.

function apiFetch(url) {
  return new Promise(resolve =>
    fetchMethod(url, (status, data) => resolve(data))
  );
}

// ── State ─────────────────────────────────────────────────────────────────────
let deliveryMethod    = 'delivery';
let lastSummary       = null;   // most recent summary response
let cachedDiscounts   = null;   // available-discounts response (fetched once)

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const auth = await apiFetch('/api/auth/status');
  if (auth.authenticated) {
    document.getElementById('nav-username').textContent = `Welcome, ${auth.user.name}`;
  }

  // Fetch available discounts (panel) and checkout summary in parallel
  const [, ] = await Promise.all([
    fetchAvailableDiscounts(),
    fetchSummary()
  ]);
});

// ── Delivery / pickup toggle ──────────────────────────────────────────────────
function setDelivery(method) {
  deliveryMethod = method;
  document.getElementById('opt-delivery').classList.toggle('active', method === 'delivery');
  document.getElementById('opt-pickup').classList.toggle('active',   method === 'pickup');
  document.getElementById('delivery-label').textContent =
    method === 'pickup' ? 'Service Fee' : 'Delivery Fee';
  document.getElementById('address-card').style.display =
    method === 'pickup' ? 'none' : 'block';
  fetchSummary();
}

// ── Fetch & render checkout summary ──────────────────────────────────────────
async function fetchSummary() {
  document.getElementById('loading').style.display         = 'block';
  document.getElementById('checkout-content').style.display = 'none';
  document.getElementById('error-msg').style.display        = 'none';

  const data = await apiFetch(`/checkout/summary?deliveryMethod=${deliveryMethod}`);

  document.getElementById('loading').style.display = 'none';

  if (!data.success) {
    const errEl = document.getElementById('error-msg');
    errEl.style.display = 'block';
    errEl.innerHTML = (data.message || '').toLowerCase().includes('empty')
      ? `Your cart is empty. <a href="/cart/retrieve/all" class="alert-link ms-2">← Back to Cart</a>`
      : esc(data.message || 'Failed to load checkout.');
    return;
  }

  lastSummary = data.summary;

  renderItems(data.items);
  renderSummary(data.summary);
  renderApplied(data.summary.appliedRules);
  updatePromoPanel();   // refresh lock states against new summary

  document.getElementById('checkout-content').style.display = 'block';
}

// ── Items table ───────────────────────────────────────────────────────────────
function renderItems(items) {
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = '';
  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="ps-3">
        <span class="fw-semibold">${esc(item.productName)}</span>
        ${item.category ? `<br><small class="text-muted">${esc(item.category)}</small>` : ''}
      </td>
      <td class="text-end">$${item.unitPrice}</td>
      <td class="text-end">${item.quantity}</td>
      <td class="text-end pe-3 fw-semibold">$${item.subtotal}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Price summary table ───────────────────────────────────────────────────────
function renderSummary(s) {
  document.getElementById('sum-subtotal').textContent = `$${fmt(s.cartSubtotal)}`;

  if (s.productDiscountAmount > 0) {
    document.getElementById('sum-prod-disc').textContent  = `-$${fmt(s.productDiscountAmount)}`;
    document.getElementById('row-prod-disc').style.display = '';
  } else {
    document.getElementById('row-prod-disc').style.display = 'none';
  }

  if (s.cartDiscountAmount > 0) {
    document.getElementById('sum-cart-disc').textContent  = `-$${fmt(s.cartDiscountAmount)}`;
    document.getElementById('row-cart-disc').style.display = '';
  } else {
    document.getElementById('row-cart-disc').style.display = 'none';
  }

  const fee = Number(s.deliveryFee);
  document.getElementById('sum-delivery').textContent = fee === 0 ? 'FREE' : `$${fmt(fee)}`;
  document.getElementById('sum-total').textContent    = `$${fmt(s.grandTotal)}`;
}

// ── Applied discounts card ────────────────────────────────────────────────────
function renderApplied(rules) {
  const card = document.getElementById('applied-card');
  const list = document.getElementById('applied-list');
  list.innerHTML = '';

  const visible = (rules || []).filter(r =>
    (r.type === 'QUANTITY_PRODUCT' && r.saving > 0) ||
    (r.type === 'CART_VALUE'       && r.saving > 0) ||
    r.type === 'DELIVERY_TIERED' ||
    r.type === 'PICKUP'
  );

  if (visible.length === 0) { card.style.display = 'none'; return; }

  visible.forEach(r => {
    const li = document.createElement('li');
    li.className = 'mb-1';
    let badge = '';
    if ((r.type === 'QUANTITY_PRODUCT' || r.type === 'CART_VALUE') && r.saving > 0) {
      badge = `<span class="badge bg-success ms-2">−$${fmt(r.saving)}</span>`;
    } else if (r.type === 'DELIVERY_TIERED') {
      badge = r.fee === 0
        ? `<span class="badge bg-success ms-2">Free!</span>`
        : `<span class="badge bg-secondary ms-2">$${fmt(r.fee)}</span>`;
    } else if (r.type === 'PICKUP') {
      badge = `<span class="badge bg-success ms-2">$0.00</span>`;
    }
    li.innerHTML = `✓ ${esc(r.description)}${badge}`;
    list.appendChild(li);
  });

  card.style.display = 'block';
}

// ── Available promotions panel ────────────────────────────────────────────────
async function fetchAvailableDiscounts() {
  const data = await apiFetch('/checkout/available-discounts');
  if (!data.success) return;
  cachedDiscounts = data;
  buildPromoPanel(data);
}

function buildPromoPanel(data) {
  const body = document.getElementById('promos-body');
  body.innerHTML = '';

  let hasContent = false;

  // ── Product discounts ──────────────────────────────────────────────────────
  const prodRules = data.productDiscounts || [];
  if (prodRules.length > 0) {
    hasContent = true;
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Product Discounts';
    body.appendChild(title);

    prodRules.forEach(r => {
      const el = document.createElement('div');
      el.id = `pr-${r.ruleId}`;
      el.className = 'promo-row p-locked';
      const who = r.productName ? `<strong>${esc(r.productName)}</strong>` : 'item';
      el.innerHTML =
        `<span class="me-1">🔒</span>Buy ≥${r.threshold} of ${who}` +
        `<span class="badge bg-warning text-dark ms-1" style="font-size:.75rem;">${r.percent}% off</span>`;
      body.appendChild(el);
    });
  }

  // ── Cart value discounts ───────────────────────────────────────────────────
  const cartRules = data.cartDiscounts || [];
  if (cartRules.length > 0) {
    hasContent = true;
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Cart Value Discounts';
    body.appendChild(title);

    cartRules.forEach(r => {
      const el = document.createElement('div');
      el.id = `cr-${r.ruleId}`;
      el.className = 'promo-row p-locked';
      el.innerHTML =
        `<span class="me-1">🔒</span>Spend $${fmt(r.threshold)}+` +
        `<span class="badge bg-warning text-dark ms-1" style="font-size:.75rem;">${r.percent}% off cart</span>`;
      body.appendChild(el);
    });
  }

  // ── Delivery tiers ─────────────────────────────────────────────────────────
  const delRules = data.deliveryRules || [];
  if (delRules.length > 0) {
    hasContent = true;
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Delivery Fees';
    body.appendChild(title);

    delRules.forEach(r => {
      const el = document.createElement('div');
      el.id = `dr-${r.ruleId}`;
      el.className = 'promo-row p-locked';
      const feeLabel = r.fee === 0 ? 'FREE' : `$${fmt(r.fee)}`;
      el.innerHTML =
        `<span class="me-1">🔒</span>Order ≥$${fmt(r.threshold)}` +
        ` → Delivery <span class="badge bg-info text-dark ms-1" style="font-size:.75rem;">${feeLabel}</span>`;
      body.appendChild(el);
    });
  }

  if (!hasContent) {
    body.innerHTML = '<p class="text-muted mb-0" style="font-size:.9rem;">No active promotions.</p>';
  }

  updatePromoPanel();
}

// Update active/locked — ✅ only when that rule applied at checkout
function updatePromoPanel() {
  if (!cachedDiscounts || !lastSummary) return;

  const firedIds = new Set(
    (lastSummary.appliedRules || [])
      .filter(r => r.ruleId != null)
      .map(r => r.ruleId)
  );

  (cachedDiscounts.productDiscounts || []).forEach(r => {
    const el = document.getElementById(`pr-${r.ruleId}`);
    if (el) setPromoState(el, firedIds.has(r.ruleId));
  });

  (cachedDiscounts.cartDiscounts || []).forEach(r => {
    const el = document.getElementById(`cr-${r.ruleId}`);
    if (el) setPromoState(el, firedIds.has(r.ruleId));
  });

  (cachedDiscounts.deliveryRules || []).forEach(r => {
    const el = document.getElementById(`dr-${r.ruleId}`);
    if (el) setPromoState(el, firedIds.has(r.ruleId));
  });
}

function setPromoState(el, isActive) {
  el.classList.remove('p-locked', 'p-active', 'p-superseded');
  const icon = el.querySelector('span.me-1');
  if (isActive) {
    el.classList.add('p-active');
    if (icon) icon.textContent = '✅';
  } else {
    el.classList.add('p-locked');
    if (icon) icon.textContent = '🔒';
  }
}

// ── Place order ───────────────────────────────────────────────────────────────
function placeOrder() {
  const btn     = document.getElementById('btn-place-order');
  const msgEl   = document.getElementById('place-order-msg');
  const address = document.getElementById('delivery-address').value.trim();

  if (deliveryMethod === 'delivery' && !address) {
    msgEl.className = 'alert alert-danger';
    msgEl.style.display = 'block';
    msgEl.textContent = 'Please enter a delivery address.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Placing Order…';
  msgEl.style.display = 'none';

  fetchMethod('/checkout/place-order', (status, data) => {
    btn.disabled = false;
    btn.textContent = 'Place Order';

    if (data.success) {
      msgEl.className = 'alert alert-success';
      msgEl.style.display = 'block';
      msgEl.innerHTML =
        `${esc(data.message)} ` +
        `<a href="/orders/my-orders" class="alert-link">View My Orders →</a>`;

      if (data.skippedCount > 0) {
        fetchSummary();
      } else {
        setTimeout(() => { window.location.href = '/orders/my-orders'; }, 1500);
      }
      return;
    }

    msgEl.className = 'alert alert-danger';
    msgEl.style.display = 'block';
    msgEl.textContent = data.message || 'Failed to place order.';
  }, 'POST', {
    deliveryMethod,
    delivery_address: deliveryMethod === 'pickup' ? 'Self-Collect' : address
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmt(n) { return Number(n).toFixed(2); }

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
