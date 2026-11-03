// routes/dashboard.js
// Admin dashboard — serves the HTML page.
// Dashboard data (JSON) is served via /api/dashboard in src/routes/api.js

const express = require('express');
const path = require('path');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /dashboard — serve dashboard HTML (admin only)
router.get('/', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// GET /dashboard/promotions — serve promotions management page (admin only)
router.get('/promotions', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/promotions.html'));
});

module.exports = router;
