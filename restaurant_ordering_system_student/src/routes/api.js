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
// TODO: implement DashboardController.index
router.get('/dashboard', ensureAuthenticated, ensureAdmin, DashboardController.index);

module.exports = router;
