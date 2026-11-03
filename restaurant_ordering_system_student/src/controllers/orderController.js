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

    // PUT /orders/:id/status — update order status
    // Members can only cancel their own PACKING orders.
    // Admins can set any status.
    static async updateStatus(req, res) {
        try {
            const memberId = req.session.userId;
            const orderId  = req.params.id;
            const { status } = req.body;

            const allowed = ['COMPLETED', 'CANCELLED', 'PACKING'];
            if (!allowed.includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status.' });
            }

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
