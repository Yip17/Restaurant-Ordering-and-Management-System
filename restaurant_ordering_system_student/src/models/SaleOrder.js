// models/SaleOrder.js
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

class SaleOrder {

    // All orders for a member — get_member_orders($1)
    static async findByMemberId(memberId) {
        const result = await pool.query(
            'SELECT * FROM get_member_orders($1)', [memberId]
        );
        return result.rows;
    }

    // Single order by ID — get_order_by_id($1)
    static async findById(orderId) {
        const result = await pool.query(
            'SELECT * FROM get_order_by_id($1)', [orderId]
        );
        return result.rows[0] || null;
    }

    // Place a new order — CALL place_order($1,$2,$3,$4,NULL,NULL)
    // Procedure validates availability, inserts order + item atomically.
    // Re-fetches the full order via get_order_by_id so the response shape
    // matches findByMemberId (includes items JSON).
    static async create({ memberId, productId, quantity, deliveryAddress }) {
        try {
            const result = await pool.query(
                'CALL place_order($1, $2, $3, $4, NULL, NULL)',
                [memberId, productId, quantity, deliveryAddress]
            );
            const orderId = result.rows[0].p_order_id;
            return await SaleOrder.findById(orderId);
        } catch (err) {
            const msg = err.message || "";
            if (msg.indexOf("PRODUCT_NOT_FOUND") === 0) {
                throw new Error('Product not found or unavailable');
            }
            throw err;
        }
    }

    // Update order status — CALL update_order_status($1,$2)
    // Procedure validates status value and order existence.
    // Re-fetches the updated row via get_order_by_id.
    static async updateStatus(orderId, status) {
        await pool.query(
            'CALL update_order_status($1, $2)', [orderId, status]
        );
        return await SaleOrder.findById(orderId);
    }

    // Ownership check — check_order_ownership($1,$2)
    static async isOwnedBy(orderId, memberId) {
        const result = await pool.query(
            'SELECT check_order_ownership($1, $2) AS owned', [orderId, memberId]
        );
        return result.rows[0].owned;
    }

    // Boolean: member has a COMPLETED order for a product — has_completed_order_for_product($1,$2)
    static async hasCompletedOrderForProduct(memberId, productId) {
        const result = await pool.query(
            'SELECT has_completed_order_for_product($1, $2) AS eligible', [memberId, productId]
        );
        return result.rows[0].eligible;
    }

    // Returns order_item_id from member's most recent completed order for a product
    // — get_completed_order_item_id($1,$2)
    static async getCompletedOrderItemId(memberId, productId) {
        const result = await pool.query(
            'SELECT get_completed_order_item_id($1, $2) AS order_item_id', [memberId, productId]
        );
        return result.rows[0].order_item_id;
    }

    // Returns the order status for an item if it belongs to the member, NULL otherwise
    // — get_order_item_status($1,$2)
    static async getOrderItemStatus(orderItemId, memberId) {
        const result = await pool.query(
            'SELECT get_order_item_status($1, $2) AS status', [orderItemId, memberId]
        );
        return result.rows[0].status;
    }

    // Dashboard summary — get_sale_order_summary($1,$2,$3,$4,$5,$6)
    static async getSummary({ startDate, endDate, category, status, sortBy, sortOrder } = {}) {
        const result = await pool.query(
            'SELECT * FROM get_sale_order_summary($1, $2, $3, $4, $5, $6)',
            [startDate || null, endDate || null, category || null,
             status || null, sortBy || 'order_date', sortOrder || 'DESC']
        );
        return result.rows.map(remapRow);
    }
}

module.exports = SaleOrder;
