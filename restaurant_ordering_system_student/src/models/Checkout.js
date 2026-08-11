// src/models/Checkout.js
// Reads the member's cart and runs the DiscountEngine to produce a pricing summary.

const prisma = require('../config/prisma');
const { calculateSummary } = require('./DiscountEngine');

/**
 * Read cart items for a member (with product details).
 * Throws if the cart is empty.
 */
async function getCartItemsForCheckout(memberId) {
    const cart = await prisma.cart.findUnique({
        where:   { memberId },
        include: {
            cartItem: {
                include: { product: true },
                orderBy: { createdAt: 'asc' }
            }
        }
    });

    if (!cart || cart.cartItem.length === 0) {
        throw new Error('Cart is empty');
    }

    return cart.cartItem;
}

/**
 * Full checkout summary: cart items + discount calculation.
 *
 * @param {number} memberId
 * @param {string} deliveryMethod  'delivery' | 'pickup'
 * @returns {{ cartItems, summary }}
 */
async function getCheckoutSummary(memberId, deliveryMethod = 'delivery') {
    const cartItems = await getCartItemsForCheckout(memberId);
    const summary   = await calculateSummary(cartItems, deliveryMethod);
    return { cartItems, summary };
}

module.exports = { getCheckoutSummary };
