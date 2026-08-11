// models/Cart.js — Cart CRUD using Prisma ORM

const prisma = require('../config/prisma');
const { Prisma } = require('@prisma/client');

// ── CREATE ────────────────────────────────────────────────────────────────────
// Add an item to the member's cart.
// If the product is already in the cart, quantity is incremented.
module.exports.createCartItem = async function createCartItem(memberId, productId, quantity) {
    if (!quantity || quantity < 1) throw new Error('Quantity must be at least 1');

    let cart = await prisma.cart.findUnique({ where: { memberId } });
    if (!cart) {
        cart = await prisma.cart.create({ data: { memberId } });
    }

    const product = await prisma.product.findUnique({ where: { productId } });
    if (!product) throw new Error('Product not found');

    const existing = await prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.cartId, productId } }
    });

    if (existing) {
        return prisma.cartItem.update({
            where: { cartItemId: existing.cartItemId },
            data:  { quantity: existing.quantity + parseInt(quantity) }
        });
    }

    return prisma.cartItem.create({
        data: { cartId: cart.cartId, productId, quantity: parseInt(quantity) }
    });
};

// ── READ ──────────────────────────────────────────────────────────────────────
// Get all cart items for a member, including product details.
module.exports.getCartItems = async function getCartItems(memberId) {
    const cart = await prisma.cart.findUnique({
        where:   { memberId },
        include: { cartItem: { include: { product: true }, orderBy: { createdAt: 'asc' } } }
    });
    if (!cart) return [];
    return cart.cartItem;
};

// Compute cart summary: totalItems, totalQuantity, subtotal.
module.exports.getCartSummary = async function getCartSummary(memberId) {
    const items = await module.exports.getCartItems(memberId);

    if (items.length === 0) {
        return {
            totalItems: 0,
            totalQuantity: 0,
            subtotal: '0.00'
        };
    }

    let totalQuantity = 0;
    let subtotal = 0;

    for (let i = 0; i < items.length; i++) {
        totalQuantity = totalQuantity + items[i].quantity;

        subtotal = subtotal +
            parseFloat(items[i].product.price) * items[i].quantity;
    }

    return {
        totalItems: items.length,
        totalQuantity: totalQuantity,
        subtotal: subtotal.toFixed(2)
    };
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
// Update the quantity of a cart item. Verifies ownership.
module.exports.updateCartItem = async function updateCartItem(memberId, cartItemId, quantity) {
    if (!quantity || quantity < 1) throw new Error('Quantity must be at least 1');

    const item = await prisma.cartItem.findUnique({ where: { cartItemId }, include: { cart: true } });
    if (!item) throw new Error('Cart item not found');
    if (item.cart.memberId !== memberId) throw new Error('Unauthorized: This cart item does not belong to you');

    return prisma.cartItem.update({ where: { cartItemId }, data: { quantity: parseInt(quantity) } });
};

// ── DELETE ────────────────────────────────────────────────────────────────────
// Remove a single cart item. Verifies ownership.
module.exports.deleteCartItem = async function deleteCartItem(memberId, cartItemId) {
    const item = await prisma.cartItem.findUnique({ where: { cartItemId }, include: { cart: true } });
    if (!item) throw new Error('Cart item not found');
    if (item.cart.memberId !== memberId) throw new Error('Unauthorized: This cart item does not belong to you');

    await prisma.cartItem.delete({ where: { cartItemId } });
    return { success: true };
};

// Remove all items from a member's cart (cart row itself is kept).
module.exports.clearCart = async function clearCart(memberId) {
    const cart = await prisma.cart.findUnique({ where: { memberId } });
    if (!cart) return { success: true };
    await prisma.cartItem.deleteMany({ where: { cartId: cart.cartId } });
    return { success: true };
};
