// models/Product.js
// Read ops  → SELECT * FROM stored function
// Write ops → CALL stored procedure

const pool = require('../config/database');

// Strip the "out_" prefix from keys returned by the plpgsql RETURNS TABLE functions.
function remapRow(data) {
    if (data == null) return data;
    const result = {};

    for (const key in data) {
        result[key.startsWith("out_") ? key.slice(4) : key] = data[key];
    }

    return result;
}

// Maps the error code prefix in the SQL RAISE message to a clean user-facing string.
function parseDbError(err) {
    const msg = err.message || "";

    if (msg.indexOf("PRODUCT_NOT_FOUND") === 0) {
        return "Product not found.";
    }

    return null;
}

class Product {

    // All available products — get_products()
    static async findAll() {
        const result = await pool.query('SELECT * FROM get_products()');
        return result.rows.map(remapRow);
    }

    // Single product by ID — get_product_by_id($1)
    static async findById(productId) {
        try {
            const result = await pool.query(
                'SELECT * FROM get_product_by_id($1)', [productId]
            );
            return remapRow(result.rows[0]);
        } catch (err) {
            const clean = parseDbError(err);
            if (clean) {
                const error = new Error(clean);
                error.userFacing = true;
                throw error;
            }
            throw err;
        }
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
        try {
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
        } catch (err) {
            const clean = parseDbError(err);
            if (clean) {
                const error = new Error(clean);
                error.userFacing = true;
                throw error;
            }
            throw err;
        }
    }
}

module.exports = Product;
