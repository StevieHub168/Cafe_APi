const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');

// GET /api/config -> { publicUrl }
// The address the QR codes open (PUBLIC_APP_URL in the .env, e.g. https://thastore.example). Empty = not set yet:
// the app then uses the address it is open on, which a phone cannot reach when that is localhost.
router.get('/', requireAuth, (req, res) => {
    const raw = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    res.status(200).json({ publicUrl: /^https?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/i.test(raw) ? raw : '' });
});

module.exports = router;
