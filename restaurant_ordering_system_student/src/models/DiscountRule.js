// src/models/DiscountRule.js
// Prisma queries for discount_rule table — used by PromotionController.

const prisma = require('../config/prisma');

// Include product name on every rule fetch
const WITH_PRODUCT = { product: { select: { productId: true, name: true } } };

// All rules ordered by type then threshold — for the admin promotions table
async function findAll() {
    return prisma.discountRule.findMany({
        include: WITH_PRODUCT,
        orderBy: [{ discountType: 'asc' }, { thresholdValue: 'asc' }]
    });
}

// All products (id + name) — for the product dropdown when creating a rule
async function findAllProducts() {
    return prisma.product.findMany({
        select:  { productId: true, name: true },
        orderBy: { name: 'asc' }
    });
}

// Check if a QUANTITY_PRODUCT rule already exists for a product
async function findProductRule(productId) {
    return prisma.discountRule.findFirst({
        where: { discountType: 'QUANTITY_PRODUCT', productId: parseInt(productId) }
    });
}

// Find one rule by primary key
async function findById(ruleId) {
    return prisma.discountRule.findUnique({ where: { ruleId } });
}

// Create a new discount rule
async function create(data) {
    return prisma.discountRule.create({ data, include: WITH_PRODUCT });
}

// Update an existing discount rule
async function update(ruleId, data) {
    return prisma.discountRule.update({ where: { ruleId }, data, include: WITH_PRODUCT });
}

// Delete a discount rule
async function remove(ruleId) {
    return prisma.discountRule.delete({ where: { ruleId } });
}

module.exports = { findAll, findAllProducts, findProductRule, findById, create, update, remove };
