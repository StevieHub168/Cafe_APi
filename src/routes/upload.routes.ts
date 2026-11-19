import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/image', requireAuth, UploadController.uploadImage);
router.delete('/:name', requireAuth, UploadController.discardImage);

export default router;
