// models/SaleOrder.js
const pool = require('../config/database');

class SaleOrder {

    // Get all orders for a member, with items and product names
    static async findByMemberId(memberId) {
        const query = `
            SELECT
                so.order_id, so.order_date, so.total_amount,
                so.status,   so.delivery_address,
                json_agg(
                    json_build_object(
                        'order_item_id', soi.order_item_id,
                        'product_id',   soi.product_id,
                        'product_name', p.name,
                        'quantity',     soi.quantity,
                        'unit_price',   soi.unit_price,
                        'subtotal',     soi.subtotal
                    ) ORDER BY soi.order_item_id
                ) AS items
            FROM sale_order so
            JOIN sale_order_item soi ON soi.order_id  = so.order_id
            JOIN product p           ON p.product_id  = soi.product_id
            WHERE so.member_id = $1
            GROUP BY so.order_id
            ORDER BY so.order_date DESC
        `;
        const result = await pool.query(query, [memberId]);
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
        return result.rows[0]?.order_item_id;
    }

    // Dashboard summary with optional filters
    static async getSummary({ startDate, endDate, category, sortBy, sortOrder } = {}) {
        const validSortColumns = {
            order_date:    'out_order_date',
            total_amount:  'out_total_amount',
            customer_name: 'out_customer_name',
            status:        'out_status'
        };
        const validOrders = ['ASC', 'DESC'];
        const orderCol = validSortColumns[sortBy]  || 'out_order_date';
        const orderDir = validOrders.includes((sortOrder || '').toUpperCase())
            ? sortOrder.toUpperCase() : 'DESC';

        const result = await pool.query(
            `SELECT * FROM get_order_summary($1, $2, $3) ORDER BY ${orderCol} ${orderDir}`,
            [startDate || null, endDate || null, category || null]
        );
        // Strip "out_" prefix so dashboard JS sees order_id, customer_name, etc.
        return result.rows.map(row => {
            const r = {};
            for (const [k, v] of Object.entries(row)) {
                r[k.startsWith('out_') ? k.slice(4) : k] = v;
            }
            return r;
        });
    }
}

module.exports = SaleOrder;
