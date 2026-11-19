import { Router } from 'express';
import { ConfigController } from '../controllers/config.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, ConfigController.get);

export default router;
