import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Everything here is for admins only.
router.use(requireAuth, requireAdmin);

// GET /api/users - everyone who can sign in
router.get('/', UserController.list);

// PUT /api/users/:id/password - set a new password for a user
router.put('/:id/password', UserController.resetPassword);

export default router;
