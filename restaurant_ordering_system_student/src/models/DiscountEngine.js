// src/models/DiscountEngine.js
// Three discount categories that stack at checkout:
//
//  1. QUANTITY_PRODUCT — one rule per product; applies when qty >= threshold
//  2. CART_VALUE       — tiered by cart subtotal; highest matching tier applies
//  3. DELIVERY_TIERED  — tiered by cart subtotal; highest matching tier applies

const prisma = require('../config/prisma');

function matchingTier(rules, value) {
    const satisfied = rules.filter(r => value >= parseFloat(r.thresholdValue));
    if (satisfied.length === 0) return null;
    
    let best = satisfied[0];

    for (let i = 1; i < satisfied.length; i++) {
        if (Number(satisfied[i].thresholdValue) > Number(best.thresholdValue)) {
            best = satisfied[i];
        }
    }

    return best;
}

async function getActiveRules() {
    return prisma.discountRule.findMany({
        where:   { isActive: true },
        include: { product: { select: { productId: true, name: true } } },
        orderBy: { thresholdValue: 'asc' }
    });
}

async function calculateSummary(cartItems, deliveryMethod = 'delivery') {
    const rules = await getActiveRules();

    let cartSubtotal = 0;

    for (let i = 0; i < cartItems.length; i++) {
        cartSubtotal = cartSubtotal + parseFloat(cartItems[i].product.price) * cartItems[i].quantity;
    }

    // ── 1. Product discounts (one rule per product) ───────────────────────
    const productRules = rules.filter(r => r.discountType === 'QUANTITY_PRODUCT');
    const appliedProductRules = [];
    let productDiscountAmount = 0;

    for (const item of cartItems) {
        const rule = productRules.find(r =>
            Number(r.productId) === Number(item.productId) &&
            item.quantity >= Number(r.thresholdValue)
        );
        if (!rule) continue;

        const itemSubtotal = parseFloat(item.product.price) * item.quantity;
        const saving = parseFloat(
            (itemSubtotal * parseFloat(rule.discountPercent) / 100).toFixed(2)
        );
        productDiscountAmount += saving;

        appliedProductRules.push({
            type:        'QUANTITY_PRODUCT',
            ruleId:      rule.ruleId,
            description: rule.description ||
                `Buy ≥${Number(rule.thresholdValue)} of ${item.product.name} → ${Number(rule.discountPercent)}% off`,
            product:     item.product.name,
            percent:     parseFloat(rule.discountPercent),
            saving
        });
    }

    productDiscountAmount = parseFloat(productDiscountAmount.toFixed(2));

    // ── 2. Cart value discount (tiered) ─────────────────────────────────
    const cartRules = rules.filter(r => r.discountType === 'CART_VALUE');
    const cartTier = matchingTier(cartRules, cartSubtotal);

    let cartDiscountAmount = 0;
    const appliedCartRules = [];

    if (cartTier) {
        cartDiscountAmount = parseFloat(
            (cartSubtotal * parseFloat(cartTier.discountPercent) / 100).toFixed(2)
        );
        appliedCartRules.push({
            type:        'CART_VALUE',
            ruleId:      cartTier.ruleId,
            description: cartTier.description ||
                `Spend $${Number(cartTier.thresholdValue).toFixed(2)}+ → ${Number(cartTier.discountPercent)}% off cart`,
            percent:     parseFloat(cartTier.discountPercent),
            saving:      cartDiscountAmount
        });
    }

    // ── 3. Delivery fee (tiered; pickup = free) ───────────────────────────
    let deliveryFee = 0;
    const appliedDeliveryRules = [];

    if (deliveryMethod === 'pickup') {
        appliedDeliveryRules.push({
            type:        'PICKUP',
            description: 'Self-collection — no delivery fee',
            fee:         0
        });
    } else {
        const deliveryRules = rules.filter(r => r.discountType === 'DELIVERY_TIERED');
        const deliveryTier = matchingTier(deliveryRules, cartSubtotal);

        if (deliveryTier) {
            deliveryFee = parseFloat(deliveryTier.deliveryFee);
            appliedDeliveryRules.push({
                type:        'DELIVERY_TIERED',
                ruleId:      deliveryTier.ruleId,
                description: deliveryTier.description ||
                    (deliveryFee === 0
                        ? `Order ≥$${Number(deliveryTier.thresholdValue).toFixed(2)} → Free delivery`
                        : `Order ≥$${Number(deliveryTier.thresholdValue).toFixed(2)} → Delivery $${deliveryFee.toFixed(2)}`),
                fee: deliveryFee
            });
        } else {
            deliveryFee = 8.00;
            appliedDeliveryRules.push({
                type:        'DELIVERY_TIERED',
                description: 'Standard delivery fee',
                fee:         deliveryFee
            });
        }
    }

    const grandTotal = Math.max(
        0,
        parseFloat(
            (cartSubtotal - productDiscountAmount - cartDiscountAmount + deliveryFee).toFixed(2)
        )
    );

    return {
        cartSubtotal:          parseFloat(cartSubtotal.toFixed(2)),
        productDiscountAmount,
        cartDiscountAmount,
        deliveryFee:           parseFloat(deliveryFee.toFixed(2)),
        deliveryMethod,
        grandTotal,
        appliedRules: [
            ...appliedProductRules,
            ...appliedCartRules,
            ...appliedDeliveryRules
        ]
    };
}

module.exports = { calculateSummary, getActiveRules };
