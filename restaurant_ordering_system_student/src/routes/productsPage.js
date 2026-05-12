// routes/productsPage.js
const express = require('express');
const path = require('path');
const { ensureAuthenticated } = require('../middleware/auth');

const router = express.Router();

// GET /member/products — serve products listing page
router.get('/products', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/products.html'));
});

// GET /member/product-detail — serve product detail page
router.get('/product-detail', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/product-detail.html'));
});

module.exports = router;