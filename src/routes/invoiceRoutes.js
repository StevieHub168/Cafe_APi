const express = require('express');
const router = express.Router();
const InvoiceController = require('../controllers/invoiceController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, InvoiceController.getAllInvoices);
router.get('/next-number', requireAuth, InvoiceController.getNextNumber);   // before "/:id", or "next-number" would be taken as an id
router.get('/:id', requireAuth, InvoiceController.getInvoiceById);
router.post('/', requireAuth, InvoiceController.createInvoice);
router.put('/:id', requireAuth, InvoiceController.updateInvoice);
router.delete('/:id', requireAuth, InvoiceController.deleteInvoice);

module.exports = router;
