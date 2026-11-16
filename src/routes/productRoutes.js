const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/productController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, ProductController.getAllProducts);
router.get('/low-stock', requireAuth, ProductController.getLowStock);
router.get('/by-code/:code', requireAuth, ProductController.getProductByCode);
router.get('/:id', requireAuth, ProductController.getProductById);
router.post('/', requireAuth, ProductController.createProduct);
router.put('/:id', requireAuth, ProductController.updateProduct);
router.delete('/:id', requireAuth, ProductController.deleteProduct);

module.exports = router;
