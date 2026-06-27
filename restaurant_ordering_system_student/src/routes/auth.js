// routes/auth.js
// Handles login, register, logout — mounted at / in server.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../config/database');
const path    = require('path');
const router  = express.Router();

// GET /login
router.get('/login', (req, res) => {
    // Redirect already-logged-in users
    if (req.session && req.session.userId) {
        return res.redirect(req.session.userRole === 'ADMIN' ? '/dashboard' : '/member/products');
    }
    res.sendFile(path.join(__dirname, '../../public/login.html'));
});

// GET /register
router.get('/register', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/member/products');
    }
    res.sendFile(path.join(__dirname, '../../public/register.html'));
});

// POST /login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const result = await db.query(
            `SELECT m.member_id, m.username, m.password_hash, mr.role
             FROM member m
             JOIN member_role mr ON mr.member_id = m.member_id
             WHERE m.email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        req.session.userId   = user.member_id;
        req.session.userRole = user.role;
        req.session.userName = user.username;
        req.session.email    = email;

        const redirectUrl = user.role === 'ADMIN' ? '/dashboard' : '/member/products';

        res.json({
            success: true,
            message: 'Login successful.',
            redirectUrl,
            user: { id: user.member_id, name: user.username, role: user.role }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'An error occurred during login.' });
    }
});

// POST /register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, first_name, last_name } = req.body;

        // --- Validate required fields ---
        if (!username || !email || !password || !first_name || !last_name) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        if (username.trim().length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }

        // --- Check username uniqueness ---
        const usernameCheck = await db.query(
            'SELECT member_id FROM member WHERE username = $1',
            [username.trim()]
        );
        if (usernameCheck.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Username is already taken.' });
        }

        // --- Check email uniqueness ---
        const emailCheck = await db.query(
            'SELECT member_id FROM member WHERE email = $1',
            [email.trim()]
        );
        if (emailCheck.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Email is already registered.' });
        }

        // --- Hash password & insert ---
        const passwordHash = await bcrypt.hash(password, 10);

        const insertResult = await db.query(
            `INSERT INTO member (username, email, password_hash, first_name, last_name)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING member_id`,
            [username.trim(), email.trim(), passwordHash, first_name.trim(), last_name.trim()]
        );

        const memberId = insertResult.rows[0].member_id;

        // --- Assign USER role ---
        await db.query(
            'INSERT INTO member_role (member_id, role) VALUES ($1, $2)',
            [memberId, 'USER']
        );

        // --- Create session ---
        req.session.userId   = memberId;
        req.session.userRole = 'USER';
        req.session.userName = username.trim();
        req.session.email    = email.trim();

        res.status(201).json({
            success:     true,
            message:     'Registration successful.',
            redirectUrl: '/member/products'
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ success: false, message: 'An error occurred during registration.' });
    }
});

// GET /logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
