// controllers/dashboardController.js
// Admin-only — protected by ensureAdmin middleware in routes/api.js.
// All data logic lives in get_sale_order_summary (SQL function).
// Controller only handles HTTP concerns: parse query params, call model, shape response.
const SaleOrder = require('../models/SaleOrder');
const Product   = require('../models/Product');

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
}

module.exports = DashboardController;
