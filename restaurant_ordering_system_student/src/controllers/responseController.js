// controllers/responseController.js
// Handles all response CRUD operations.
// Routes that use this controller: src/routes/feedback.js

const Response = require('../models/Response');

class ResponseController {
    // TODO: POST /feedback/:feedbackId/responses — submit new response
    // Must verify: logged-in member is NOT the feedback author
    static async create(req, res) {}

    // TODO: DELETE /responses/:id — delete response
    // Must verify: response belongs to the logged-in member
    static async delete(req, res) {}
}

module.exports = ResponseController;
