const express = require('express');
const router = express.Router();
const TelegramController = require('../controllers/telegramController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/status', requireAuth, TelegramController.status);
router.post('/send', requireAuth, TelegramController.send);

module.exports = router;
