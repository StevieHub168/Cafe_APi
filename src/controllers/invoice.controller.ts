import { Request, Response } from 'express';
import { InvoiceService } from '../services/invoice.service';
import { parsePageRequest } from '../utils/pagination';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status
// (a mistake in what was typed is a 400, an invoice that does not exist is a 404).
export class InvoiceController {
    // GET /api/invoices?type=sale&period=month&search=dell          every matching invoice
    // GET /api/invoices?type=sale&page=1&per_page=20                one page (see utils/pagination.ts)
    static async getAllInvoices(req: Request, res: Response): Promise<void> {
        const page = parsePageRequest(req.query);
        res.status(200).json(page ? await InvoiceService.getInvoicePage(req.query, page) : await InvoiceService.getAllInvoices(req.query));
    }

    static async getNextNumber(_req: Request, res: Response): Promise<void> {
        res.status(200).json({ number: await InvoiceService.getNextNumber() });
    }

    static async getInvoiceById(req: Request, res: Response): Promise<void> {
        res.status(200).json(await InvoiceService.getInvoiceById(String(req.params.id)));
    }

    static async createInvoice(req: Request, res: Response): Promise<void> {
        res.status(201).json(await InvoiceService.createInvoice(req.body));
    }

    static async updateInvoice(req: Request, res: Response): Promise<void> {
        res.status(200).json(await InvoiceService.updateInvoice(String(req.params.id), req.body));
    }

    static async deleteInvoice(req: Request, res: Response): Promise<void> {
        res.status(200).json(await InvoiceService.deleteInvoice(String(req.params.id)));
    }
}
