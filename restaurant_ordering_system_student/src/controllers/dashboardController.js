// controllers/dashboardController.js
// Handles admin dashboard data.
// Used by: src/routes/dashboard.js

const SaleOrder = require('../models/SaleOrder');
const Product = require('../models/Product');

class DashboardController {
    // TODO: GET /api/dashboard — return filtered order summary as JSON
    // Filters: start_date, end_date, category, sort_by, sort_order
    static async index(req, res) {}
}

module.exports = DashboardController;
