// models/Feedback.js
// Write ops  → CALL stored procedure
// Read ops   → SELECT * FROM stored function
//
// RETURNS TABLE columns in the SQL functions use the "out_" prefix to avoid
// plpgsql name ambiguity. The remapRow() helper strips that prefix so the
// rest of the application sees clean field names (feedback_id, rating, …).

const pool = require('../config/database');

// Strip the "out_" prefix from keys returned by the plpgsql RETURNS TABLE functions.
function remapRow(data) {
    if (data == null) {
        return data;
    }

    let result = {};

    for (let key in data) {
        let newKey = key.replace("out_", "");
        result[newKey] = data[key];
    }

    return result;
}

// Maps the error code prefix in the SQL RAISE message to a clean user-facing string.
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

class Feedback {

    // All feedback for a product (feedback index page)
    static async findByProductId(productId) {
        const result = await pool.query(
            'SELECT * FROM get_feedback_by_product($1)', [productId]
        );
        return result.rows.map(remapRow);
    }

    // Single feedback entry (edit page pre-population)
    static async findById(feedbackId) {
        const result = await pool.query(
            'SELECT * FROM get_feedback_by_id($1)', [feedbackId]
        );
        return remapRow(result.rows[0]);
    }

    // All feedback submitted by a member (my-feedback list)
    static async findByMemberId(memberId) {
        const result = await pool.query(
            'SELECT * FROM get_feedback($1)', [memberId]
        );
        return result.rows.map(remapRow);
    }

    // Create — CALL procedure, then fetch the full row for the response
    static async create({ memberId, productId, rating, comment }) {
        try {
            const result = await pool.query(
                'CALL create_feedback($1, $2, $3, $4, $5)',
                [memberId, productId, rating, comment, null]
            );
            const feedbackId = result.rows[0].p_feedback_id;
            return await Feedback.findById(feedbackId);
        } catch (err) {
            const clean = parseDbError(err);
            
            if (clean) {
                const error = new Error(clean);
                error.userFacing = true;
                throw error;}            
            
            throw err;
        }
    }

    // Update — CALL procedure, then re-fetch
    static async update(feedbackId, memberId, { rating, comment }) {
        try {
            await pool.query(
                'CALL update_feedback($1, $2, $3, $4)',
                [feedbackId, memberId, rating, comment]
            );
            return await Feedback.findById(feedbackId);
        } catch (err) {
            const clean = parseDbError(err);
            
            if (clean) {
                const error = new Error(clean);
                error.userFacing = true;
                throw error;}            
            
            throw err;
        }
    }

    // Delete — CALL procedure (responses cascade via FK)
    static async delete(feedbackId, memberId) {
        try {
            await pool.query(
                'CALL delete_feedback($1, $2)',
                [feedbackId, memberId]
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

    // Check if member already reviewed this product
    static async existsForMemberProduct(memberId, productId) {
        const result = await pool.query(
            'SELECT feedback_exists_for_member_product($1, $2) AS exists',
            [memberId, productId]
        );
        return result.rows[0].exists;
    }
}

module.exports = Feedback;
