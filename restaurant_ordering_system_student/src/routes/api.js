// routes/api.js
// Internal JSON API endpoints.
// Mounted at /api in server.js

const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const DashboardController = require('../controllers/dashboardController');

// GET /api/auth/status — returns current session info
router.get('/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        return res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            }
        });
    }
    res.json({ authenticated: false });
});

// GET /api/dashboard — returns filtered order summary (admin only)
router.get('/dashboard', ensureAuthenticated, ensureAdmin, DashboardController.index);

// GET /api/dashboard/product-feedback?category=X
// Returns the product for a given category with all feedback and responses (admin only).
router.get('/dashboard/product-feedback', ensureAuthenticated, ensureAdmin, DashboardController.getProductFeedback);

// PATCH /api/dashboard/product-availability
// Toggles a product's is_available flag (admin only).
router.patch('/dashboard/product-availability', ensureAuthenticated, ensureAdmin, DashboardController.updateProductAvailability);

module.exports = router;
