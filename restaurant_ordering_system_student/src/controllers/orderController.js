// controllers/orderController.js
const SaleOrder = require('../models/SaleOrder');

class OrderController {

    // GET /orders/my — member's own orders
    static async myOrders(req, res) {
        try {
            const orders = await SaleOrder.findByMemberId(req.session.userId);
            res.json({ success: true, orders });
        } catch (err) {
            console.error('myOrders error:', err);
            res.status(500).json({ success: false, message: 'Failed to load orders.' });
        }
    }

    // POST /orders — place a new order
    static async create(req, res) {
        try {
            const memberId = req.session.userId;
            const { product_id, quantity = 1, delivery_address } = req.body;

            if (!product_id) {
                return res.status(400).json({ success: false, message: 'Product is required.' });
            }
            if (!delivery_address || !delivery_address.trim()) {
                return res.status(400).json({ success: false, message: 'Delivery address is required.' });
            }
            if (quantity < 1) {
                return res.status(400).json({ success: false, message: 'Quantity must be at least 1.' });
            }

            const order = await SaleOrder.create({
                memberId,
                productId:       product_id,
                quantity:        parseInt(quantity),
                deliveryAddress: delivery_address.trim()
            });

            res.status(201).json({ success: true, order });
        } catch (err) {
            console.error('create order error:', err);
            const msg = err.message === 'Product not found or unavailable'
                ? err.message : 'Failed to place order.';
            res.status(500).json({ success: false, message: msg });
        }
    }

    // PUT /orders/:id/status — update order status
    // Member can only cancel their own PACKING orders
    static async updateStatus(req, res) {
        try {
            const memberId = req.session.userId;
            const orderId  = req.params.id;
            const { status } = req.body;

            const allowed = ['COMPLETED', 'CANCELLED', 'PACKING'];
            if (!allowed.includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status.' });
            }

            // Members can only cancel — admins handle COMPLETED/PACKING via dashboard
            if (req.session.userRole !== 'ADMIN') {
                if (status !== 'CANCELLED') {
                    return res.status(403).json({ success: false, message: 'You can only cancel your own orders.' });
                }
                const owned = await SaleOrder.isOwnedBy(orderId, memberId);
                if (!owned) {
                    return res.status(403).json({ success: false, message: 'Order not found.' });
                }
            }

            const order = await SaleOrder.updateStatus(orderId, status);
            res.json({ success: true, order });
        } catch (err) {
            console.error('updateStatus error:', err);
            res.status(500).json({ success: false, message: 'Failed to update order.' });
        }
    }
}

module.exports = OrderController;
