// controllers/dashboardController.js
// Admin-only — protected by ensureAdmin middleware in routes/api.js.
// All data logic lives in get_sale_order_summary (SQL function).
// Controller only handles HTTP concerns: parse query params, call model, shape response.
const SaleOrder = require('../models/SaleOrder');
const Product   = require('../models/Product');
const Feedback  = require('../models/Feedback');
const Response  = require('../models/Response');

class DashboardController {

    // GET /api/dashboard
    // Accepts query params: start_date, end_date, category, status, sort_by, sort_order
    static async index(req, res) {
        try {
            const filters = {
                startDate:  req.query.start_date  || null,
                endDate:    req.query.end_date    || null,
                category:   req.query.category   || null,
                status:     req.query.status      || null,
                sortBy:     req.query.sort_by     || 'order_date',
                sortOrder:  req.query.sort_order  || 'DESC'
            };

            // Run summary query and category fetch in parallel
            const [orders, categories] = await Promise.all([
                SaleOrder.getSummary(filters),   // → get_sale_order_summary()
                Product.getCategories()
            ]);

            // Compute summary stats from the returned rows (all done in SQL already,
            // but we derive these totals from the result set for the stat cards).
            const totalOrders   = orders.length;
            let totalRevenue = 0;

            const statusCounts = {
                PACKING: 0,
                COMPLETED: 0,
                CANCELLED: 0
            };

            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];

                totalRevenue += Number(order.total_amount);

                if (statusCounts[order.status] !== undefined) {
                    statusCounts[order.status]++;
                }
            }

            res.json({
                success: true,
                orders,
                categories,
                // Return snake_case keys — dashboard.js reads filters.start_date etc.
                filters: {
                    start_date: filters.startDate,
                    end_date:   filters.endDate,
                    category:   filters.category,
                    status:     filters.status,
                    sort_by:    filters.sortBy,
                    sort_order: filters.sortOrder
                },
                stats: { totalOrders, totalRevenue, statusCounts },
                user: {
                    id:   req.session.userId,
                    name: req.session.userName,
                    role: req.session.userRole
                }
            });

        } catch (err) {
            console.error('Dashboard error:', err);
            // Surface user-facing DB errors (e.g. INVALID_STATUS)
            if (msg.indexOf("INVALID_STATUS") === 0) {
                return res.status(400).json({ success: false, message: err.message.split(':')[1].trim() });
            }
            res.status(500).json({ success: false, message: 'Failed to load dashboard data.' });
        }
    }
    // GET /api/dashboard/product-feedback?category=X
    // Returns the product matching the category with all its feedback and responses.
    // Used by the admin dashboard to view and reply to customer feedback per product.
    static async getProductFeedback(req, res) {
        try {
            const category = req.query.category || null;

            if (!category) {
                return res.json({ success: true, product: null, feedback: [] });
            }

            // Resolve product from category name via Product model
            const product = await Product.findByCategory(category);
            if (!product) {
                return res.json({ success: true, product: null, feedback: [] });
            }

            // Fetch all feedback for that product — calls get_feedback_by_product() SQL function
            const feedbackRows = await Feedback.findByProductId(product.product_id);

            // For each feedback entry, attach its responses — calls get_response() SQL function
            for (const fb of feedbackRows) {
                fb.responses = await Response.findByFeedbackId(fb.feedback_id);
            }

            res.json({ success: true, product, feedback: feedbackRows });

        } catch (err) {
            console.error('getProductFeedback error:', err);
            res.status(500).json({ success: false, message: 'Failed to load product feedback.' });
        } 
    }
    // PATCH /api/dashboard/product-availability
    // Toggles a product's is_available flag. Admin-only.
    // Body: { product_id, is_available }
    // When set to false, SaleOrder.create() already blocks new orders because
    // it checks is_available = true before inserting — no extra gate needed.
    static async updateProductAvailability(req, res) {
        try {
            const { product_id, is_available } = req.body;

            if (product_id === undefined || product_id === null) {
                return res.status(400).json({ success: false, message: 'product_id is required.' });
            }
            if (typeof is_available !== 'boolean') {
                return res.status(400).json({ success: false, message: 'is_available must be true or false.' });
            }

            const product = await Product.setAvailability(product_id, is_available);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            res.json({ success: true, product });
        } catch (err) {
            console.error('updateProductAvailability error:', err);
            res.status(500).json({ success: false, message: 'Failed to update product availability.' });
        }
    }
}

module.exports = DashboardController;