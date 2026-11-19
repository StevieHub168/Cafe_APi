const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// POST /api/auth/register - Admin only user creation
router.post('/register', requireAuth, requireAdmin, AuthController.register);

// POST /api/auth/login - User login
router.post('/login', AuthController.login);

// POST /api/auth/telegram-login - Auto-login the recognized Telegram admin (no password)
router.post('/telegram-login', AuthController.telegramLogin);

// POST /api/auth/logout - User logout (requires authentication)
router.post('/logout', requireAuth, AuthController.logout);

// GET /api/auth/me - Get current authenticated user
router.get('/me', requireAuth, AuthController.me);

// GET /api/auth/user/:id - Get user info (admin only: it shows the email, phone and role of a person)
router.get('/user/:id', requireAuth, requireAdmin, AuthController.getUserInfo);

module.exports = router;
