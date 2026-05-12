// models/Feedback.js
// Handles all database queries for the feedback table.
// Business rules:
// - A customer can only submit feedback for products they've ordered in COMPLETED orders
// - A customer can update/delete only their own feedback

const pool = require('../config/database');

class Feedback {
    // TODO: Get all feedback for a specific product (with member info)
    static async findByProductId(productId) {}

    // TODO: Get a single feedback by ID (with member info)
    static async findById(feedbackId) {}

    // TODO: Create new feedback
    static async create(feedbackData) {}

    // TODO: Update existing feedback
    static async update(feedbackId, feedbackData) {}

    // TODO: Delete feedback
    static async delete(feedbackId) {}

    // TODO: Check if feedback belongs to a specific member
    static async isOwnedBy(feedbackId, memberId) {}
}

module.exports = Feedback;
