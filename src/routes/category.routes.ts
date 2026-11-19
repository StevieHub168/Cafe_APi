import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, CategoryController.getAllCategories);
router.get('/:id', requireAuth, CategoryController.getCategoryById);
router.post('/', requireAuth, CategoryController.createCategory);
router.put('/:id', requireAuth, CategoryController.updateCategory);
router.delete('/:id', requireAuth, CategoryController.deleteCategory);

router.post('/:id/brands', requireAuth, CategoryController.addBrand);
router.put('/:id/brands/:name', requireAuth, CategoryController.renameBrand);
router.delete('/:id/brands/:name', requireAuth, CategoryController.deleteBrand);

export default router;
