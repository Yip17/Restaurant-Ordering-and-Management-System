// models/Member.js
// Read ops  → SELECT * FROM stored function
// Write ops → CALL stored procedure
// bcrypt stays in Node — it is a JS library, not a DB concern.

const pool   = require('../config/database');
const bcrypt = require('bcryptjs');

class Member {

    // Look up a member by email for login — get_member_by_email($1)
    static async findByEmail(email) {
        const result = await pool.query(
            'SELECT * FROM get_member_by_email($1)', [email]
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            member_id:     row.out_member_id,
            username:      row.out_username,
            password_hash: row.out_password_hash,
            role:          row.out_role
        };
    }

    // Compare a plaintext password against a stored hash
    static async validatePassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    // Register a new member — CALL register_member($1...$6, NULL)
    // Hash is computed here; the procedure inserts member + role atomically.
    static async create({ username, email, password, firstName, lastName, role = 'USER' }) {
        const passwordHash = await bcrypt.hash(password, 10);
        try {
            const result = await pool.query(
                'CALL register_member($1, $2, $3, $4, $5, $6, NULL)',
                [username, email, passwordHash, firstName, lastName, role]
            );
            return result.rows[0].p_member_id;
        } catch (err) {
            const msg = err.message || "";

            if (msg.indexOf("USERNAME_TAKEN") === 0) {
                const error = new Error("Username is already taken.");
                error.code = "USERNAME_TAKEN";
                throw error;
            }

            if (msg.indexOf("EMAIL_TAKEN") === 0) {
                const error = new Error("Email is already registered.");
                error.code = "EMAIL_TAKEN";
                throw error;
            }

            throw err;
        }
    }
}

module.exports = Member;
