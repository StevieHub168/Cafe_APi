import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, ProductController.getAllProducts);
router.get('/low-stock', requireAuth, ProductController.getLowStock);
router.get('/by-code/:code', requireAuth, ProductController.getProductByCode);
router.get('/:id', requireAuth, ProductController.getProductById);
router.post('/', requireAuth, ProductController.createProduct);
router.put('/:id', requireAuth, ProductController.updateProduct);
router.delete('/:id', requireAuth, ProductController.deleteProduct);

export default router;
