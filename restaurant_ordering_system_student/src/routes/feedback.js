// routes/feedback.js
// All feedback and response routes.
// HTML pages are served from public/feedback/
// All routes require authentication (ensureAuthenticated)

const express = require('express');
const path = require('path');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const FeedbackController = require('../controllers/feedbackController');
const ResponseController = require('../controllers/responseController');

// --- Feedback HTML pages ---

// GET /feedback/:productId — feedback listing page for a product
router.get('/:productId', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/index.html'));
});

// GET /feedback/create — create feedback page
router.get('/create', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/create.html'));
});

// GET /feedback/:id/edit — edit feedback page
router.get('/:id/edit', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/feedback/edit.html'));
});

// --- Feedback JSON API ---

// TODO: POST /feedback — create new feedback
// TODO: PUT /feedback/:id — update feedback
// TODO: DELETE /feedback/:id — delete feedback

// --- Response JSON API ---

// TODO: POST /feedback/:feedbackId/responses — create response
// TODO: DELETE /responses/:id — delete response

module.exports = router;
