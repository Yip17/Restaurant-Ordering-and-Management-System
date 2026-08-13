// models/Cart.js
// Cart CRUD operations using Prisma ORM
// Uses the shared Prisma singleton (with @prisma/adapter-pg) from src/config/prisma.js

const prisma = require('../config/prisma');
const { Prisma } = require('@prisma/client');

// ==================== CREATE ====================

/**
 * Add an item to the member's cart.
 * If the product is already in the cart, the quantity is incremented.
 */
module.exports.createCartItem = async function createCartItem(memberId, productId, quantity) {
    try {
        if (!quantity || quantity < 1) {
            throw new Error('Quantity must be at least 1');
        }

        // Upsert the cart row (one per member)
        let cart = await prisma.cart.findUnique({
            where: { memberId }
        });

        if (!cart) {
            cart = await prisma.cart.create({
                data: { memberId }
            });
        }

        // Confirm the product exists
        const product = await prisma.product.findUnique({
            where: { productId }
        });

        if (!product) {
            throw new Error('Product not found');
        }

        // If the item is already in the cart, add to its quantity
        const existing = await prisma.cartItem.findUnique({
            where: {
                cartId_productId: {
                    cartId: cart.cartId,
                    productId
                }
            }
        });

        if (existing) {
            const updated = await prisma.cartItem.update({
                where: { cartItemId: existing.cartItemId },
                data: { quantity: existing.quantity + parseInt(quantity) }
            });
            return updated;
        }

        // Otherwise create a new cart item
        const cartItem = await prisma.cartItem.create({
            data: {
                cartId:    cart.cartId,
                productId,
                quantity:  parseInt(quantity)
            }
        });
        return cartItem;

    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            throw new Error('Invalid product or member ID');
        }
        throw error;
    }
};

// ==================== READ ====================

/**
 * Get all cart items for a member, including product details.
 */
module.exports.getCartItems = async function getCartItems(memberId) {
    try {
        const cart = await prisma.cart.findUnique({
            where: { memberId },
            include: {
                cartItem: {
                    include: { product: true },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!cart) return [];
        return cart.cartItem;

    } catch (error) {
        throw error;
    }
};

/**
 * Compute cart summary on the backend.
 * Returns: totalItems, totalQuantity, subtotal
 */
module.exports.getCartSummary = async function getCartSummary(memberId) {
    try {
        const items = await module.exports.getCartItems(memberId);

        if (items.length === 0) {
            return { totalItems: 0, totalQuantity: 0, subtotal: '0.00' };
        }

        let totalQuantity = 0;
        let subtotal = 0;

        for (const item of items) {
            totalQuantity += item.quantity;
            subtotal += parseFloat(item.product.price) * item.quantity;
        }

        return {
            totalItems:    items.length,
            totalQuantity,
            subtotal:      subtotal.toFixed(2)
        };
    } catch (error) {
        throw error;
    }
};

// ==================== UPDATE ====================

/**
 * Update the quantity of a single cart item.
 * Verifies that the item belongs to the requesting member.
 */
module.exports.updateCartItem = async function updateCartItem(memberId, cartItemId, quantity) {
    try {
        if (!quantity || quantity < 1) {
            throw new Error('Quantity must be at least 1');
        }

        // Ownership check
        const item = await prisma.cartItem.findUnique({
            where: { cartItemId },
            include: { cart: true }
        });

        if (!item) {
            throw new Error('Cart item not found');
        }
        if (item.cart.memberId !== memberId) {
            throw new Error('Unauthorized: This cart item does not belong to you');
        }

        const updated = await prisma.cartItem.update({
            where: { cartItemId },
            data:  { quantity: parseInt(quantity) }
        });
        return updated;

    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new Error('Cart item not found');
        }
        throw error;
    }
};

// ==================== DELETE ====================

/**
 * Remove a single cart item.
 * Verifies that the item belongs to the requesting member.
 * Does NOT delete the cart, the product, or any orders.
 */
module.exports.deleteCartItem = async function deleteCartItem(memberId, cartItemId) {
    try {
        // Ownership check
        const item = await prisma.cartItem.findUnique({
            where: { cartItemId },
            include: { cart: true }
        });

        if (!item) {
            throw new Error('Cart item not found');
        }
        if (item.cart.memberId !== memberId) {
            throw new Error('Unauthorized: This cart item does not belong to you');
        }

        await prisma.cartItem.delete({ where: { cartItemId } });
        return { success: true };

    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new Error('Cart item not found');
        }
        throw error;
    }
};

/**
 * Remove all items from a member's cart (cart row itself is kept).
 */
module.exports.clearCart = async function clearCart(memberId) {
    try {
        const cart = await prisma.cart.findUnique({ where: { memberId } });
        if (!cart) return { success: true, message: 'Cart is already empty' };

        await prisma.cartItem.deleteMany({ where: { cartId: cart.cartId } });
        return { success: true };

    } catch (error) {
        throw error;
    }
};
