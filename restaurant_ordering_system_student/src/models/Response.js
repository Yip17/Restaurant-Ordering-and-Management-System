// models/Response.js
// Handles all database queries for the response table.
// Business rules:
// - Any customer (except the feedback author) can submit a response
// - A customer can delete only their own responses
// - Updating responses is NOT required

const pool = require('../config/database');

class Response {
    // TODO: Get all responses for a specific feedback (with member info)
    static async findByFeedbackId(feedbackId) {}

    // TODO: Create new response
    static async create(responseData) {}

    // TODO: Delete response
    static async delete(responseId) {}

    // TODO: Check if response belongs to a specific member
    static async isOwnedBy(responseId, memberId) {}

    // TODO: Get feedback author ID (to prevent them from responding to their own feedback)
    static async getFeedbackAuthorId(feedbackId) {}
}

module.exports = Response;
