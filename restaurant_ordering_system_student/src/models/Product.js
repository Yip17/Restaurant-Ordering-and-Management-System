// models/Product.js
// Read ops  → SELECT * FROM stored function
// Write ops → CALL stored procedure

const pool = require('../config/database');

// Strip the "out_" prefix from keys returned by the plpgsql RETURNS TABLE functions.
function remapRow(data) {
    if (data == null) return data;
    const result = {};
    for (const key in data) {
        result[key.replace('out_', '')] = data[key];
    }
    return result;
}

class Product {

    // All available products — get_products()
    static async findAll() {
        const result = await pool.query('SELECT * FROM get_products()');
        return result.rows.map(remapRow);
    }

    // Single product by ID — get_product_by_id($1)
    static async findById(productId) {
        const result = await pool.query(
            'SELECT * FROM get_product_by_id($1)', [productId]
        );
        return remapRow(result.rows[0]);
    }

    // Distinct category list — get_product_categories()
    static async getCategories() {
        const result = await pool.query('SELECT * FROM get_product_categories()');
        return result.rows.map(r => r.out_category);
    }

    // First product in a category — get_product_by_category($1)
    static async findByCategory(category) {
        const result = await pool.query(
            'SELECT * FROM get_product_by_category($1)', [category]
        );
        return remapRow(result.rows[0]) || null;
    }

    // Toggle availability — CALL update_product_availability($1, $2, NULL, NULL, NULL, NULL)
    static async setAvailability(productId, isAvailable) {
        const result = await pool.query(
            'CALL update_product_availability($1, $2, NULL, NULL, NULL, NULL)',
            [productId, isAvailable]
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            product_id:   row.p_out_id,
            name:         row.p_out_name,
            category:     row.p_out_category,
            is_available: row.p_out_available
        };
    }
}

module.exports = Product;
