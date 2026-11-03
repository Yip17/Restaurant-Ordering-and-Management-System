const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
}));

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes (login, register, logout) — mounted at root
app.use('/', require('./src/routes/auth'));

// Dashboard — admin only
app.use('/dashboard', require('./src/routes/dashboard'));

// Product JSON API
app.use('/products', require('./src/routes/products'));

// Member HTML pages (products list, product detail)
app.use('/member', require('./src/routes/productsPage'));

// Order routes (place order, view my orders, update status)
app.use('/orders', require('./src/routes/orders'));

// Cart routes (add, view, update, delete cart items)
app.use('/cart', require('./src/routes/cart'));

// Checkout routes (pricing summary with discounts)
app.use('/checkout', require('./src/routes/checkout'));

// Feedback routes (view, create, edit feedback + responses)
app.use('/feedback', require('./src/routes/feedback'));

// Internal API (dashboard data, auth status)
app.use('/api', require('./src/routes/api'));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});