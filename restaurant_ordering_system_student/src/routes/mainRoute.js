// routes/mainRoutes.js
const express = require('express');
const router = express.Router();

// Backend API (JSON)
const apiRoutes = require('./api');          // Dashboard & auth status
const productRoutes = require('./products'); // JSON product data

// Frontend routes
const authRoutes = require('./auth');            // Login/register/logout
const productPageRoutes = require('./productsPage'); // HTML pages

// ====================
// Backend API endpoints
// ====================
router.use('/api', apiRoutes);           // /api/dashboard (admin), /api/auth/status
router.use('/api/products', productRoutes); // /api/products (any user)

// ====================
// Frontend pages & auth
// ====================
router.use('/auth', authRoutes);            // /auth/login, /auth/register
router.use('/member', productPageRoutes);   // /member/products, /member/product-detail

module.exports = router;