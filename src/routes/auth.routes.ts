import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';
import { loginLimiter } from '../middleware/login-limiter.middleware';

const router = Router();

// POST /api/auth/register - Admin only user creation
router.post('/register', requireAuth, requireAdmin, AuthController.register);

// POST /api/auth/login - User login (too many wrong passwords in a row: blocked for a while)
router.post('/login', loginLimiter, AuthController.login);

// POST /api/auth/telegram-login - Auto-login the recognized Telegram admin (no password)
router.post('/telegram-login', AuthController.telegramLogin);

// POST /api/auth/logout - User logout (requires authentication)
router.post('/logout', requireAuth, AuthController.logout);

// GET /api/auth/me - Get current authenticated user
router.get('/me', requireAuth, AuthController.me);

// GET /api/auth/user/:id - Get user info (admin only: it shows the email, phone and role of a person)
router.get('/user/:id', requireAuth, requireAdmin, AuthController.getUserInfo);

export default router;
