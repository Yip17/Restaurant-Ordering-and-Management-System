// Checkout routes — mounted at /checkout in server.js
const express            = require('express');
const path               = require('path');
const router             = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const CheckoutController = require('../controllers/checkoutController');

// GET /checkout — serve checkout HTML page
router.get('/', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/checkout.html'));
});

// GET /checkout/summary — JSON: calculate discounts and return full breakdown
router.get('/summary', ensureAuthenticated, CheckoutController.getSummary);

// GET /checkout/available-discounts — JSON: all active discount rules (for display)
router.get('/available-discounts', ensureAuthenticated, CheckoutController.getAvailableDiscounts);

module.exports = router;
