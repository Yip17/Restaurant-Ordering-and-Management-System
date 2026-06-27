// routes/orders.js — mounted at /orders in server.js
const express = require('express');
const path    = require('path');
const router  = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const OrderController         = require('../controllers/orderController');

// GET /orders/my-orders — serve my orders HTML page
router.get('/my-orders', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/orders.html'));
});

// GET /orders/my — JSON: logged-in member's orders
router.get('/my', ensureAuthenticated, OrderController.myOrders);

// POST /orders — place a new order
router.post('/', ensureAuthenticated, OrderController.create);

// PUT /orders/:id/status — update order status
router.put('/:id/status', ensureAuthenticated, OrderController.updateStatus);

module.exports = router;
