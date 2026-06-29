// models/Product.js
const pool = require('../config/database');

class Product {
    static async findAll() {
        const query = 'SELECT * FROM product WHERE is_available = true ORDER BY name';
        const result = await pool.query(query);
        return result.rows;
    }

    static async findById(productId) {
        const query = 'SELECT * FROM product WHERE product_id = $1';
        const result = await pool.query(query, [productId]);
        return result.rows[0];
    }

    static async getCategories() {
        const query = 'SELECT DISTINCT category FROM product WHERE category IS NOT NULL ORDER BY category';
        const result = await pool.query(query);
        return result.rows.map(row => row.category);
    }

    // Returns the first product matching a category name (one product per category in this dataset).
    static async findByCategory(category) {
        const result = await pool.query(
            'SELECT product_id, name, category, is_available FROM product WHERE category = $1 LIMIT 1',
            [category]
        );
        return result.rows[0] || null;
    }

    // Toggle a product's availability. Admin-only — enforced at the route level.
    static async setAvailability(productId, isAvailable) {
        const result = await pool.query(
            'UPDATE product SET is_available = $1 WHERE product_id = $2 RETURNING product_id, name, category, is_available',
            [isAvailable, productId]
        );
        return result.rows[0] || null;
    }
}

module.exports = Product;