// models/Member.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class Member {
    static async findByUsername(username) {
        const query = `
            SELECT m.*, mr.role 
            FROM member m 
            LEFT JOIN member_role mr ON m.member_id = mr.member_id 
            WHERE m.username = $1
        `;
        const result = await pool.query(query, [username]);
        return result.rows[0];
    }

    static async validatePassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    static async create(userData) {
        const { username, email, password, firstName, lastName, role = 'USER' } = userData;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const memberQuery = `
                INSERT INTO member (username, email, password_hash, first_name, last_name)
                VALUES ($1, $2, $3, $4, $5) RETURNING member_id
            `;
            const memberResult = await client.query(memberQuery, [username, email, hashedPassword, firstName, lastName]);
            const memberId = memberResult.rows[0].member_id;
            
            const roleQuery = `INSERT INTO member_role (member_id, role) VALUES ($1, $2)`;
            await client.query(roleQuery, [memberId, role]);
            
            await client.query('COMMIT');
            return memberId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Member;