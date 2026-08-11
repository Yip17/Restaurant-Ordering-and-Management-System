// controllers/cartController.js
const Cart = require('../models/Cart');

class CartController {

    // POST /cart/items — add item to cart
    static async createCartItem(req, res) {
        try {
            const memberId  = req.session.userId;
            const { product_id, quantity = 1 } = req.body;

            if (!product_id) {
                return res.status(400).json({ success: false, message: 'Product ID is required.' });
            }

            const qty = parseInt(quantity);
            if (isNaN(qty) || qty < 1) {
                return res.status(400).json({ success: false, message: 'Quantity must be at least 1.' });
            }

            const cartItem = await Cart.createCartItem(memberId, parseInt(product_id), qty);
            return res.status(201).json({ success: true, cartItem });

        } catch (err) {
            console.error('createCartItem error:', err);
            if (err.message === 'Product not found') {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }
            return res.status(500).json({ success: false, message: 'Failed to add item to cart.' });
        }
    }

    // GET /cart/items — get all items + summary
    static async getCartItems(req, res) {
        try {
            const memberId = req.session.userId;
            const items   = await Cart.getCartItems(memberId);
            const summary = await Cart.getCartSummary(memberId);
            return res.json({ success: true, items, summary });
        } catch (err) {
            console.error('getCartItems error:', err);
            return res.status(500).json({ success: false, message: 'Failed to retrieve cart.' });
        }
    }

    // PUT /cart/items/:cartItemId — update item quantity
    static async updateCartItem(req, res) {
        try {
            const memberId   = req.session.userId;
            const cartItemId = parseInt(req.params.cartItemId);
            const { quantity } = req.body;

            if (isNaN(cartItemId)) {
                return res.status(400).json({ success: false, message: 'Invalid cart item ID.' });
            }

            const qty = parseInt(quantity);
            if (isNaN(qty) || qty < 1) {
                return res.status(400).json({ success: false, message: 'Quantity must be at least 1.' });
            }

            const updatedItem = await Cart.updateCartItem(memberId, cartItemId, qty);
            const summary     = await Cart.getCartSummary(memberId);
            return res.json({ success: true, cartItem: updatedItem, summary });

        } catch (err) {
            console.error('updateCartItem error:', err);
            if (err.message === 'Cart item not found') {
                return res.status(404).json({ success: false, message: 'Cart item not found.' });
            }
            if (err.message.startsWith('Unauthorized')) {
                return res.status(403).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: 'Failed to update cart item.' });
        }
    }

    // DELETE /cart/items/:cartItemId — remove single item
    static async deleteCartItem(req, res) {
        try {
            const memberId   = req.session.userId;
            const cartItemId = parseInt(req.params.cartItemId);

            if (isNaN(cartItemId)) {
                return res.status(400).json({ success: false, message: 'Invalid cart item ID.' });
            }

            await Cart.deleteCartItem(memberId, cartItemId);
            const summary = await Cart.getCartSummary(memberId);
            return res.json({ success: true, summary });

        } catch (err) {
            console.error('deleteCartItem error:', err);
            if (err.message === 'Cart item not found') {
                return res.status(404).json({ success: false, message: 'Cart item not found.' });
            }
            if (err.message.startsWith('Unauthorized')) {
                return res.status(403).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: 'Failed to delete cart item.' });
        }
    }

    // DELETE /cart — clear entire cart
    static async clearCart(req, res) {
        try {
            const memberId = req.session.userId;
            await Cart.clearCart(memberId);
            return res.json({ success: true, message: 'Cart cleared.' });
        } catch (err) {
            console.error('clearCart error:', err);
            return res.status(500).json({ success: false, message: 'Failed to clear cart.' });
        }
    }
}

module.exports = CartController;
