// src/models/Checkout.js
// Prisma query for reading the member's cart at checkout.

const prisma = require('../config/prisma');

// Returns all cart items with product details for a member.
// Throws 'Cart is empty' if the cart has no items.
async function getCartItems(memberId) {
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

module.exports = { getCartItems };
