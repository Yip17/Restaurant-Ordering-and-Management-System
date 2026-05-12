// models/SaleOrder.js
// Handles all database queries for sale_order and sale_order_item tables.
// Used by: dashboardController.js, feedbackController.js (to verify order ownership)

const pool = require('../config/database');

class SaleOrder {
    // TODO: Get all orders with optional filters (date range, category, sort)
    // Used by the admin dashboard
    static async getSummary(filters) {}

    // TODO: Check if a member has a COMPLETED order containing a specific product
    // Used to validate feedback eligibility
    static async hasCompletedOrderForProduct(memberId, productId) {}
}

module.exports = SaleOrder;
