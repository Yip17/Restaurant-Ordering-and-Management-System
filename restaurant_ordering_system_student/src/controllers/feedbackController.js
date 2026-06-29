// controllers/feedbackController.js
// Validation and access control are enforced in the stored procedures.
// Controllers handle HTTP concerns: parse input, call model, shape response.
const Feedback = require('../models/Feedback');
const pool     = require('../config/database');

// Helper: sends a DB user-facing error as a 400, unknown errors as 500
function handleError(res, err) {
    console.error(err);
    if (err.userFacing) {
        return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
}

class FeedbackController {

    // GET /feedback/:productId/all
    static async getByProduct(req, res) {
        try {
            const feedback = await Feedback.findByProductId(req.params.productId);
            res.json({ success: true, feedback });
        } catch (err) { handleError(res, err); }
    }

    // GET /feedback/:feedbackId/detail
    static async getById(req, res) {
        try {
            const feedback = await Feedback.findById(req.params.feedbackId);
            if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
            res.json({ success: true, feedback });
        } catch (err) { handleError(res, err); }
    }

    // GET /feedback/my
    static async index(req, res) {
        try {
            const feedback = await Feedback.findByMemberId(req.session.userId);
            res.json({ success: true, feedback });
        } catch (err) { handleError(res, err); }
    }

    // GET /feedback/order-item/:orderItemId/eligibility
    // Checks whether the logged-in member can submit feedback for a specific order item.
    // Authorization: order item must belong to the member and its order must be COMPLETED.
    // Returns: { eligible, alreadyReviewed, reason }
    static async getOrderItemEligibility(req, res) {
        try {
            const memberId    = req.session.userId;
            const orderItemId = req.params.orderItemId;

            const orderCheck = await pool.query(
                `SELECT so.status
                   FROM sale_order_item soi
                   JOIN sale_order so ON so.order_id = soi.order_id
                  WHERE soi.order_item_id = $1 AND so.member_id = $2`,
                [orderItemId, memberId]
            );

            // Item doesn't exist or doesn't belong to this member
            if (orderCheck.rows.length === 0) {
                return res.status(403).json({
                    success:  false,
                    eligible: false,
                    reason:   'Order item not found or does not belong to you.'
                });
            }

            if (orderCheck.rows[0].status !== 'COMPLETED') {
                return res.json({
                    success:  true,
                    eligible: false,
                    reason:   'You can only write feedback after your order is completed.'
                });
            }

            const alreadyReviewed = await Feedback.existsForOrderItem(orderItemId, memberId);
            if (alreadyReviewed) {
                return res.json({
                    success:         true,
                    eligible:        false,
                    alreadyReviewed: true,
                    reason:          'You have already submitted feedback for this order item.'
                });
            }

            res.json({ success: true, eligible: true, alreadyReviewed: false, reason: null });
        } catch (err) { handleError(res, err); }
    }

    // POST /feedback
    // Expects: { order_item_id, rating, comment }
    // Authorization enforced in create_feedback procedure:
    //   - order item must belong to the member
    //   - order must be COMPLETED
    //   - no existing feedback for this order item
    static async create(req, res) {
        try {
            const memberId    = req.session.userId;
            const { order_item_id, rating, comment } = req.body;

            if (!order_item_id) {
                return res.status(400).json({ success: false, message: 'Order item is required.' });
            }

            const feedback = await Feedback.create({
                memberId,
                orderItemId: order_item_id,
                rating:      parseInt(rating),
                comment
            });

            res.status(201).json({ success: true, feedback });
        } catch (err) { handleError(res, err); }
    }

    // PUT /feedback/:id
    // Stored procedure enforces ownership + validation
    static async update(req, res) {
        try {
            const memberId   = req.session.userId;
            const feedbackId = req.params.id;
            const { rating, comment } = req.body;

            const feedback = await Feedback.update(feedbackId, memberId, {
                rating:  parseInt(rating),
                comment
            });

            res.json({ success: true, feedback });
        } catch (err) { handleError(res, err); }
    }

    // DELETE /feedback/:id
    // Stored procedure enforces ownership
    static async delete(req, res) {
        try {
            await Feedback.delete(req.params.id, req.session.userId);
            res.json({ success: true });
        } catch (err) { handleError(res, err); }
    }
}

module.exports = FeedbackController;
