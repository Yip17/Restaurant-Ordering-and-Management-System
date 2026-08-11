// seed-discounts.js — populate discount_rule with example promotions.
// Usage: node seed-discounts.js

const prisma = require('./src/config/prisma');

async function findProductByName(namePattern) {
    const products = await prisma.product.findMany({ orderBy: { productId: 'asc' } });
    const exact = products.find(p => p.name.toLowerCase() === namePattern.toLowerCase());
    if (exact) return exact;
    const partial = products.find(p => p.name.toLowerCase().includes(namePattern.toLowerCase()));
    return partial || products[0] || null;
}

async function main() {
    const pizza = await findProductByName('Margherita');
    if (!pizza) {
        throw new Error('No products found — seed the product table first.');
    }

    await prisma.discountRule.deleteMany({});

    await prisma.discountRule.createMany({
        data: [
            // ── PRODUCT DISCOUNT (quantity-based, per product) ────────────
            {
                discountType:    'QUANTITY_PRODUCT',
                thresholdValue:  3,
                discountPercent: 10,
                deliveryFee:     0,
                productId:       pizza.productId,
                isActive:        true,
                description:     `Buy ≥3 of ${pizza.name} → 10% off`
            },

            // ── CART VALUE DISCOUNT (tiered) ──────────────────────────────
            {
                discountType:    'CART_VALUE',
                thresholdValue:  100,
                discountPercent: 5,
                deliveryFee:     0,
                productId:       null,
                isActive:        true,
                description:     'Spend $100.00+ → 5% off cart'
            },
            {
                discountType:    'CART_VALUE',
                thresholdValue:  200,
                discountPercent: 8,
                deliveryFee:     0,
                productId:       null,
                isActive:        true,
                description:     'Spend $200.00+ → 8% off cart'
            },

            // ── DELIVERY TIERS (tiered — one applies) ─────────────────────
            {
                discountType:    'DELIVERY_TIERED',
                thresholdValue:  0,
                discountPercent: 0,
                deliveryFee:     8,
                productId:       null,
                isActive:        true,
                description:     'Delivery $8.00 (orders under $50)'
            },
            {
                discountType:    'DELIVERY_TIERED',
                thresholdValue:  50,
                discountPercent: 0,
                deliveryFee:     5,
                productId:       null,
                isActive:        true,
                description:     'Delivery $5.00 (orders $50–$99.99)'
            },
            {
                discountType:    'DELIVERY_TIERED',
                thresholdValue:  100,
                discountPercent: 0,
                deliveryFee:     0,
                productId:       null,
                isActive:        true,
                description:     'Free delivery (orders $100+)'
            }
        ]
    });

    const rules = await prisma.discountRule.findMany({
        include: { product: { select: { name: true } } },
        orderBy: { ruleId: 'asc' }
    });

    console.log('Seeded discount rules:');
    rules.forEach(r => {
        const label = r.product ? `[${r.product.name}]` : '';
        console.log(`  [${r.ruleId}] ${r.discountType.padEnd(18)} ${label} ${r.description}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
