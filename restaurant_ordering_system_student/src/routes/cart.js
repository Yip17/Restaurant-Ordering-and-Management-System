// routes/cart.js — mounted at /cart in server.js
const express        = require('express');
const path           = require('path');
const router         = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const CartController = require('../controllers/cartController');

// ── HTML page routes ──────────────────────────────────────────
// GET /cart/create — serve add-to-cart page
router.get('/create', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/cart-create.html'));
});

// GET /cart/retrieve/all — serve cart view page
router.get('/retrieve/all', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/cart.html'));
});

// ── JSON API routes ───────────────────────────────────────────
// POST /cart/items — add item to cart
router.post('/items', ensureAuthenticated, CartController.createCartItem);

// GET /cart/items — retrieve all cart items + summary
router.get('/items', ensureAuthenticated, CartController.getCartItems);

// GET /cart/summary — cart summary only
router.get('/summary', ensureAuthenticated, CartController.getCartSummary);

// PUT /cart/items/:cartItemId — update item quantity
router.put('/items/:cartItemId', ensureAuthenticated, CartController.updateCartItem);

// DELETE /cart/items/:cartItemId — remove single item
router.delete('/items/:cartItemId', ensureAuthenticated, CartController.deleteCartItem);

// DELETE /cart — clear entire cart
router.delete('/', ensureAuthenticated, CartController.clearCart);

module.exports = router;
