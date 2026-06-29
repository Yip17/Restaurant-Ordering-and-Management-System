// models/SaleOrder.js
const pool = require('../config/database');

function remapRow(data) {
    if (data == null) {
        return data;
    }

    let result = {};

    for (let key in data) {
        let newKey = key.replace("out_", "");
        result[newKey] = data[key];
    }

    return result;
}

class SaleOrder {

    // Get all orders for a member, with items and product names
    static async findByMemberId(memberId) {
        const result = await pool.query(
            "SELECT * FROM get_member_orders($1)",
            [memberId]
        );

        return result.rows;
    }

    // Place a new order (single product, quantity 1 for simplicity)
    static async create({ memberId, productId, quantity, deliveryAddress }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Fetch current price
            const prodResult = await client.query(
                'SELECT price FROM product WHERE product_id = $1 AND is_available = true',
                [productId]
            );
            if (prodResult.rows.length === 0) throw new Error('Product not found or unavailable');

            const unitPrice  = parseFloat(prodResult.rows[0].price);
            const subtotal   = unitPrice * quantity;
            const totalAmount = subtotal;

            // Insert order
            const orderResult = await client.query(
                `INSERT INTO sale_order (member_id, total_amount, status, delivery_address)
                 VALUES ($1, $2, 'PACKING', $3) RETURNING *`,
                [memberId, totalAmount, deliveryAddress]
            );
            const order = orderResult.rows[0];

            // Insert order item
            const itemResult = await client.query(
                `INSERT INTO sale_order_item (order_id, product_id, quantity, unit_price, subtotal)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [order.order_id, productId, quantity, unitPrice, subtotal]
            );

            await client.query('COMMIT');
            return { ...order, items: [itemResult.rows[0]] };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Update order status — used by member (CANCELLED) or admin
    static async updateStatus(orderId, status) {
        const result = await pool.query(
            `UPDATE sale_order SET status = $1 WHERE order_id = $2 RETURNING *`,
            [status, orderId]
        );
        return result.rows[0];
    }

    // Check ownership
    static async isOwnedBy(orderId, memberId) {
        const result = await pool.query(
            'SELECT 1 FROM sale_order WHERE order_id = $1 AND member_id = $2',
            [orderId, memberId]
        );
        return result.rows.length > 0;
    }

    // Check if a member has at least one COMPLETED order containing a product
    static async hasCompletedOrderForProduct(memberId, productId) {
        const result = await pool.query(
            'SELECT has_completed_order_for_product($1, $2) AS eligible',
            [memberId, productId]
        );
        return result.rows[0].eligible;
    }

    // Get the order_item_id from the most recent completed order for a product
    static async getCompletedOrderItemId(memberId, productId) {
        const result = await pool.query(
            'SELECT get_completed_order_item_id($1, $2) AS order_item_id',
            [memberId, productId]
        );
        return result.rows[0].order_item_id;
    }

    // Dashboard summary — calls get_sale_order_summary (admin-only SQL function).
    // All filtering, sorting, and aggregation is performed at the database level.
    static async getSummary({ startDate, endDate, category, status, sortBy, sortOrder } = {}) {
        const result = await pool.query(
            `SELECT * FROM get_sale_order_summary($1, $2, $3, $4, $5, $6)`,
            [
                startDate  || null,
                endDate    || null,
                category   || null,
                status     || null,
                sortBy     || 'order_date',
                sortOrder  || 'DESC'
            ]
        );
        // Strip the "out_" prefix added by the RETURNS TABLE declaration so
        // downstream code (controller, dashboard JS) sees clean field names.
        return result.rows.map(remapRow);
    }
}

module.exports = SaleOrder;
