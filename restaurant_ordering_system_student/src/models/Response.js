// models/Response.js
// Write ops → CALL stored procedure
// Read ops  → SELECT * FROM stored function
//
// RETURNS TABLE columns use "out_" prefix in SQL; remapRow() strips it.

const pool = require('../config/database');

function remapRow(data) {
    if (data == null) return data;
    const result = {};

    for (const key in data) {
        result[key.startsWith("out_") ? key.slice(4) : key] = data[key];
    }

    return result;
}

function parseDbError(err) {
    const msg = err.message || "";

    const codes = {
        FEEDBACK_NOT_FOUND: "Feedback not found.",
        MEMBER_NOT_FOUND: "Member not found.",
        BLANK_RESPONSE: "Response text cannot be empty.",
        RESPONSE_NOT_FOUND: "Response not found."
    };

    if (msg.indexOf("ACCESS_DENIED") === 0) {
        return msg.split(":")[1].trim() || "Access denied.";
    }

    for (let code in codes) {
        if (msg.indexOf(code) === 0) {
            return codes[code];
        }
    }

    return null;
}

class Response {

    // All responses for a feedback entry
    static async findByFeedbackId(feedbackId) {
        const result = await pool.query(
            'SELECT * FROM get_response($1)', [feedbackId]
        );
        return result.rows.map(remapRow);
    }

    // Create — CALL procedure
    static async create({ feedbackId, memberId, responseText }) {
        try {
            const result = await pool.query(
                'CALL create_response($1, $2, $3, $4)',
                [feedbackId, memberId, responseText, null]
            );
            return {
                response_id: result.rows[0].p_response_id,
                feedback_id: feedbackId,
                member_id:   memberId
            };
        } catch (err) {
            const clean = parseDbError(err);
            
            if (clean) {
                const error = new Error(clean);
                error.userFacing = true;
                throw error;}            
            
            throw err;
        }
    }

    // Delete — CALL procedure
    static async delete(responseId, memberId) {
        try {
            await pool.query(
                'CALL delete_response($1, $2)',
                [responseId, memberId]
            );
        } catch (err) {
            const clean = parseDbError(err);
            
            if (clean) {
                const error = new Error(clean);
                error.userFacing = true;
                throw error;}            
            
            throw err;
        }
    }

    // Returns the member_id of the feedback author (access control in responseController)
    static async getFeedbackAuthorId(feedbackId) {
        const result = await pool.query(
            'SELECT get_feedback_author_id($1) AS member_id', [feedbackId]
        );
        return result.rows[0].member_id;
    }
}

module.exports = Response;
