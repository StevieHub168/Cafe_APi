import { Router } from 'express';
import { TelegramController } from '../controllers/telegram.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/status', requireAuth, TelegramController.status);
router.post('/send', requireAuth, TelegramController.send);

export default router;
