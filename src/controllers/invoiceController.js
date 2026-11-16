const InvoiceService = require('../services/invoiceService');

// A mistake in what was typed is a 400; an invoice that does not exist is a 404.
const fail = (res, error) => res.status(error.statusCode || 400).json({ error: error.message });

class InvoiceController {
    static async getAllInvoices(req, res) {
        try {
            res.status(200).json(await InvoiceService.getAllInvoices(req.query.type));
        } catch (error) {
            fail(res, error);
        }
    }

    static async getNextNumber(req, res) {
        try {
            res.status(200).json({ number: await InvoiceService.getNextNumber() });
        } catch (error) {
            fail(res, error);
        }
    }

    static async getInvoiceById(req, res) {
        try {
            res.status(200).json(await InvoiceService.getInvoiceById(req.params.id));
        } catch (error) {
            fail(res, error);
        }
    }

    static async createInvoice(req, res) {
        try {
            res.status(201).json(await InvoiceService.createInvoice(req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    static async updateInvoice(req, res) {
        try {
            res.status(200).json(await InvoiceService.updateInvoice(req.params.id, req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    static async deleteInvoice(req, res) {
        try {
            res.status(200).json(await InvoiceService.deleteInvoice(req.params.id));
        } catch (error) {
            fail(res, error);
        }
    }
}

module.exports = InvoiceController;
