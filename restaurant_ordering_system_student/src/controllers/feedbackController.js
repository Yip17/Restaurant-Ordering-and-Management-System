// controllers/feedbackController.js
// Validation and access control are enforced in the stored procedures.
// Controllers handle HTTP concerns: parse input, call model, shape response.
const Feedback  = require('../models/Feedback');
const SaleOrder = require('../models/SaleOrder');

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

    // GET /feedback/:productId/eligibility
    static async getEligibility(req, res) {
        try {
            const memberId        = req.session.userId;
            const productId       = req.params.productId;
            const hasOrder        = await SaleOrder.hasCompletedOrderForProduct(memberId, productId);
            const alreadyReviewed = await Feedback.existsForMemberProduct(memberId, productId);
            res.json({ success: true, eligible: hasOrder && !alreadyReviewed, alreadyReviewed });
        } catch (err) { handleError(res, err); }
    }

    // POST /feedback
    // Basic presence check here; all business rules enforced in create_feedback procedure
    static async create(req, res) {
        try {
            const memberId              = req.session.userId;
            const { product_id, rating, comment } = req.body;

            if (!product_id) {
                return res.status(400).json({ success: false, message: 'Product is required.' });
            }

            // Stored procedure handles all other validation
            const feedback = await Feedback.create({
                memberId,
                productId: product_id,
                rating:    parseInt(rating),
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
