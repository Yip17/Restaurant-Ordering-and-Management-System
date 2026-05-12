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
}

module.exports = Product;