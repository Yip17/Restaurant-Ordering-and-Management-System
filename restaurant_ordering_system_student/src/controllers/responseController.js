// controllers/responseController.js
// Validation and access control are enforced in the stored procedures.
const Response = require('../models/Response');

function handleError(res, err) {
    console.error(err);
    if (err.userFacing) {
        return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
}

class ResponseController {

    // GET /feedback/:feedbackId/responses
    static async getByFeedback(req, res) {
        try {
            const responses = await Response.findByFeedbackId(req.params.feedbackId);
            res.json({ success: true, responses });
        } catch (err) { handleError(res, err); }
    }

    // POST /feedback/:feedbackId/responses
    // Stored procedure enforces: feedback exists, not own feedback, text not blank
    static async create(req, res) {
        try {
            const memberId   = req.session.userId;
            const feedbackId = req.params.feedbackId;
            const { response_text } = req.body;

            const response = await Response.create({
                feedbackId,
                memberId,
                responseText: response_text
            });

            res.status(201).json({ success: true, response });
        } catch (err) { handleError(res, err); }
    }

    // DELETE /feedback/responses/:id
    // Stored procedure enforces ownership
    static async delete(req, res) {
        try {
            await Response.delete(req.params.id, req.session.userId);
            res.json({ success: true });
        } catch (err) { handleError(res, err); }
    }
}

module.exports = ResponseController;
