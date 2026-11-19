import { Router } from 'express';
import { RepairController } from '../controllers/repair.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, RepairController.getAllRepairs);
router.get('/:id', requireAuth, RepairController.getRepairById);
router.post('/', requireAuth, RepairController.createRepair);
router.put('/:id', requireAuth, RepairController.updateRepair);
router.delete('/:id', requireAuth, RepairController.deleteRepair);

export default router;
