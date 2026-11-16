const express = require('express');
const router = express.Router();
const RepairController = require('../controllers/repairController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, RepairController.getAllRepairs);
router.get('/:id', requireAuth, RepairController.getRepairById);
router.post('/', requireAuth, RepairController.createRepair);
router.put('/:id', requireAuth, RepairController.updateRepair);
router.delete('/:id', requireAuth, RepairController.deleteRepair);

module.exports = router;
