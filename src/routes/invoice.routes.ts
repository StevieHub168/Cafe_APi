import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, InvoiceController.getAllInvoices);
router.get('/next-number', requireAuth, InvoiceController.getNextNumber);   // before "/:id", or "next-number" would be taken as an id
router.get('/:id', requireAuth, InvoiceController.getInvoiceById);
router.post('/', requireAuth, InvoiceController.createInvoice);
router.put('/:id', requireAuth, InvoiceController.updateInvoice);
router.delete('/:id', requireAuth, InvoiceController.deleteInvoice);

export default router;
