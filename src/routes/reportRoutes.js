const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Combined dashboard payload for the analysis report page
router.get('/dashboard', reportController.getDashboard);

router.get('/summary', reportController.getSummary);
router.get('/sales-trend', reportController.getSalesTrend);
router.get('/top-items', reportController.getTopItems);
router.get('/category-sales', reportController.getCategorySales);
router.get('/payment-methods', reportController.getPaymentMethods);
router.get('/cashier-performance', reportController.getCashierPerformance);

module.exports = router;
