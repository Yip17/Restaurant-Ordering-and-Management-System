// routes/feedback.js
// Mounted at /feedback in server.js.
//
// CRITICAL ORDERING RULE: Express matches routes top-to-bottom.
// All static string paths (/create, /my, /responses/:id) MUST be registered
// BEFORE any parameterised paths (/:id, /:productId) or Express will swallow them.

const express  = require('express');
const path     = require('path');
const router   = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const FeedbackController      = require('../controllers/feedbackController');
const ResponseController      = require('../controllers/responseController');

// =============================================================================
// 1. STATIC HTML PAGES  (no params — must be first)
// =============================================================================

// GET /feedback/create — write new feedback form
router.get('/create', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/create.html'));
});

// GET /feedback/my-feedback — member's own feedback management page (HTML)
// Must be before any :param routes so Express doesn't swallow "my-feedback" as a productId.
router.get('/my-feedback', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/my-feedback.html'));
});

// =============================================================================
// 2. STATIC API PATHS  (fixed string segments — before any :param routes)
// =============================================================================

// GET  /feedback/my  — logged-in member's own feedback list (JSON)
router.get('/my', ensureAuthenticated, FeedbackController.index);

// POST /feedback  — submit new feedback (body: { order_item_id, rating, comment })
router.post('/', ensureAuthenticated, FeedbackController.create);

// DELETE /feedback/responses/:id  — delete own response
// "responses" is a fixed string so it must come before /:id
router.delete('/responses/:id', ensureAuthenticated, ResponseController.delete);

// =============================================================================
// 3. PARAMETERISED ROUTES with a fixed second segment  e.g. /:id/edit
//    These beat the bare catch-all because they are more specific.
// =============================================================================

// GET  /feedback/order-item/:orderItemId/eligibility
// Checks whether the logged-in member can submit feedback for an order item.
// Must be registered before /:feedbackId/detail etc. — but "order-item" is a
// static string prefix so it won't conflict with numeric :id segments.
router.get('/order-item/:orderItemId/eligibility', ensureAuthenticated, FeedbackController.getOrderItemEligibility);

// GET  /feedback/:id/edit         — serve edit feedback page
router.get('/:id/edit', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/edit.html'));
});

// GET  /feedback/:productId/all         — all feedback for a product (JSON)
router.get('/:productId/all', ensureAuthenticated, FeedbackController.getByProduct);

// GET  /feedback/:feedbackId/detail     — single feedback entry for edit pre-population (JSON)
router.get('/:feedbackId/detail', ensureAuthenticated, FeedbackController.getById);

// GET  /feedback/:feedbackId/responses  — list responses for one feedback (JSON)
router.get('/:feedbackId/responses', ensureAuthenticated, ResponseController.getByFeedback);

// POST /feedback/:feedbackId/responses  — submit a response
router.post('/:feedbackId/responses', ensureAuthenticated, ResponseController.create);

// PUT  /feedback/:id  — update own feedback
router.put('/:id', ensureAuthenticated, FeedbackController.update);

// DELETE /feedback/:id  — delete own feedback
router.delete('/:id', ensureAuthenticated, FeedbackController.delete);

// =============================================================================
// 4. BARE PARAM CATCH-ALL  — must be absolutely last GET
// =============================================================================

// GET /feedback/:productId  — serve feedback listing page for a product
router.get('/:productId', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/index.html'));
});

module.exports = router;
