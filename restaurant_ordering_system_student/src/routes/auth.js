// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const router = express.Router();
const path = require('path');

// Serve login page
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/login.html'));
});

// Serve register page
router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/register.html'));
});


// Handle login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({ success: false, message: 'Email and password are required' });
        }

        const query = 'SELECT m.member_id, m.username, m.password_hash, mr.role FROM member m JOIN member_role mr ON m.member_id = mr.member_id WHERE m.email = $1;'
        const result = await db.query(query, [email]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.json({ success: false, message: 'Invalid email or password' });
        }

        // Create session
        req.session.userId = user.member_id;
        req.session.userRole = user.role;
        req.session.userName = user.username;
        req.session.email = email;

        // Determine redirect URL based on role

        let redirectUrl;

        if (user.role === 'ADMIN'){
            redirectUrl = '/dashboard';
        } else if (user.role === 'USER'){
            redirectUrl = '/member/products';
        } else {
            redirectUrl = '/login';
        }
        
        res.json({ 
            success: true, 
            message: 'Login successful', 
            redirectUrl: redirectUrl,
            user: {
                id: user.member_id,
                name: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        res.json({ success: false, message: 'An error occurred during login' });
    }
});

// Handle registration
router.post('/register', async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      first_name,
      last_name
    } = req.body;

    // 1. Validate required fields
    if (!username || !email || !password || !first_name || !last_name) {
      return res.json({
        success: false,
        message: 'All fields are required'
      });
    }

    // 2. Check if email already exists
    const checkEmailQuery = `
      SELECT member_id
      FROM member
      WHERE email = $1
    `;
    const emailCheckResult = await db.query(checkEmailQuery, [email]);

    if (emailCheckResult.rows.length > 0) {
      return res.json({
        success: false,
        message: 'Email already registered'
      });
    }

    // 3. Hash password using bcryptjs
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Insert into member table (ALL required fields)
    const insertMemberQuery = `
      INSERT INTO member (
        username,
        email,
        password_hash,
        first_name,
        last_name
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING member_id
    `;

    const insertMemberResult = await db.query(insertMemberQuery, [
      username,
      email,
      passwordHash,
      first_name,
      last_name
    ]);

    const memberId = insertMemberResult.rows[0].member_id;

    // 5. Assign USER role in member_role ✅
    const insertRoleQuery = `
      INSERT INTO member_role (member_id, role)
      VALUES ($1, 'USER')
    `;
    await db.query(insertRoleQuery, [memberId]);

    // 6. Create session (same structure as login)
    req.session.userId = memberId;
    req.session.userRole = 'USER';
    req.session.userName = username;
    req.session.email = email;

    // 7. Respond
    res.json({
      success: true,
      message: 'Registration successful',
      redirectUrl: '/member/products'
    });

  } catch (error) {
    res.json({
      success: false,
      message: 'An error occurred during registration'
    });
  }
});

// Handle logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.redirect('/login');
    });
});

module.exports = router;