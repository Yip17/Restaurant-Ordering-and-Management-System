// controllers/authController.js
const Member = require('../models/Member');

class AuthController {
    static async showLogin(req, res) {
        res.render('login', { error: null });
    }

    static async login(req, res) {
        try {
            const { email, password } = req.body;
            const member = await Member.findByUsername(email);

            if (!member || !await Member.validatePassword(password, member.password_hash)) {
                return res.render('login', { error: 'Invalid email or password' });
            }

            req.session.user = {
                id: member.member_id,
                username: member.username,
                email: member.email,
                role: member.role
            }

            if (member.role === 'ADMIN') {
                res.redirect('/dashboard');
            } else {
                res.redirect('/feedback');
            }
        } catch (error) {
            console.error('Login error:', error);
            res.render('login', { error: '***An error occurred during login' });
        }
    }

    static logout(req, res) {
        req.session.destroy();
        res.redirect('/login');
    }
}

module.exports = AuthController;