// controllers/feedbackController.js
// Handles all feedback CRUD operations.
// Routes that use this controller: src/routes/feedback.js

const Feedback = require('../models/Feedback');
const SaleOrder = require('../models/SaleOrder');

class FeedbackController {
    // TODO: GET /feedback/:productId — list all feedback for a product
    static async index(req, res) {}

    // TODO: GET /feedback/create?productId=X — serve create feedback page
    static async showCreate(req, res) {}

    // TODO: POST /feedback — submit new feedback
    // Must verify: member has a COMPLETED order containing the product
    static async create(req, res) {}

    // TODO: GET /feedback/:id/edit — serve edit feedback page
    // Must verify: feedback belongs to the logged-in member
    static async showEdit(req, res) {}

    // TODO: PUT /feedback/:id — update feedback
    // Must verify: feedback belongs to the logged-in member
    static async update(req, res) {}

    // TODO: DELETE /feedback/:id — delete feedback
    // Must verify: feedback belongs to the logged-in member
    static async delete(req, res) {}
}

module.exports = FeedbackController;
