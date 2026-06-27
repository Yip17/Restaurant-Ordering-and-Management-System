// controllers/dashboardController.js
const SaleOrder = require('../models/SaleOrder');
const Product   = require('../models/Product');

class DashboardController {

    // GET /api/dashboard
    static async index(req, res) {
        try {
            const filters = {
                startDate:  req.query.start_date,
                endDate:    req.query.end_date,
                category:   req.query.category,
                sortBy:     req.query.sort_by    || 'order_date',
                sortOrder:  req.query.sort_order || 'DESC'
            };

            const [orders, categories] = await Promise.all([
                SaleOrder.getSummary(filters),
                Product.getCategories()
            ]);

            res.json({
                success: true,
                orders,
                categories,
                filters,
                user: {
                    id:   req.session.userId,
                    name: req.session.userName,
                    role: req.session.userRole
                }
            });

        } catch (err) {
            console.error('Dashboard error:', err);
            res.status(500).json({ success: false, message: 'Failed to load dashboard data.' });
        }
    }
}

module.exports = DashboardController;
