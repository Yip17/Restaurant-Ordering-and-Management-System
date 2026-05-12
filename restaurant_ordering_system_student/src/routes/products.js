// routes/products.js
const express = require('express');
const db = require('../config/database');
const router = express.Router();

// GET /products - retrieve all products (member view)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT product_id, name, description, price, category, is_available, created_at
      FROM product
      ORDER BY created_at DESC
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      products: result.rows
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve products'
    });
  }
});

// GET /products/:id - retrieve a single product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT product_id, name, description, price, category, is_available, created_at
      FROM product
      WHERE product_id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve product'
    });
  }
});

module.exports = router;