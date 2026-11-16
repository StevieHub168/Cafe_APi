const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const Repair = require('../models/Repair');
const { cleanMoney, cleanPhone, cleanTelegram, cleanDate } = require('../utils/clean');

// How many lines fit on the printed paper of each kind (the paper is A5).
const MAX_LINES = { sale: 9, booking: 5, repair: 7 };
const WARRANTIES = ['1_week', '2_weeks', '1_month', 'none'];

// Digital invoices continue the paper pad: the first one is 000041. (INVOICE_START_NUMBER changes it.)
const START_NUMBER = Number(process.env.INVOICE_START_NUMBER) || 41;
const MAX_NUMBER = 999999;
// What still fits on the printed paper without being cut off.
const MAX_NAME = 90;       // an item name (two lines in its row)
const MAX_DEVICE = 80;     // one line
const MAX_PROBLEM = 140;   // two lines
const ATTEMPTS = 10;   // how often to pick a new automatic number when it was taken a moment ago

const notFound = () => Object.assign(new Error('Invoice not found'), { statusCode: 404 });
const printed = (number) => String(number).padStart(6, '0');
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- the items ----------

// A row with no name and no price is an empty row of the form: ignored. Anything else must be complete.
function cleanItems(list, type) {
    if (!Array.isArray(list)) throw new Error('Add at least one item');
    const rows = list.filter(r => r && (String(r.name ?? '').trim() !== '' || (r.unit_price !== '' && r.unit_price !== null && r.unit_price !== undefined)));
    if (rows.length === 0) throw new Error('Add at least one item');
    if (rows.length > MAX_LINES[type]) throw new Error(`A ${type} invoice has room for ${MAX_LINES[type]} items`);

    return rows.map((r, i) => {
        const name = String(r.name ?? '').trim().replace(/\s+/g, ' ');
        if (!name) throw new Error(`Item ${i + 1}: please write the name`);
        if (name.length > MAX_NAME) throw new Error(`Item ${i + 1}: the name is too long (max ${MAX_NAME} characters)`);
        const qty = Number(r.qty ?? 1);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new Error(`Item ${i + 1}: quantity must be a whole number from 1 to 999`);
        return { name, qty, unit_price: cleanMoney(r.unit_price, `Item ${i + 1}: price`) };
    });
}

// ---------- one complete invoice ----------

function optionalText(value, what, max) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (text.length > max) throw new Error(`${what} is too long (max ${max} characters)`);
    return text || null;
}

function requiredText(value, what, max) {
    const text = optionalText(value, what, max);
    if (!text) throw new Error(`${what} is required`);
    return text;
}

// Checks a COMPLETE invoice and returns it in the shape the model saves. (`number` is already decided here.)
async function prepare(input) {
    const type = String(input.type ?? '');
    if (!MAX_LINES[type]) throw new Error('Type must be sale, booking or repair');

    const number = Number(input.number);
    if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) throw new Error(`Invoice number must be a whole number from 1 to ${MAX_NUMBER}`);

    const invoiceDate = cleanDate(input.invoice_date, 'Date');

    const items = cleanItems(input.items, type);
    const total = round2(items.reduce((sum, item) => sum + item.qty * item.unit_price, 0));
    if (total <= 0) throw new Error('The total must be more than 0');
    const deposit = cleanMoney(input.deposit ?? 0, 'Deposit');
    if (deposit > total) throw new Error('Deposit cannot be more than the total');

    const warranty = String(input.warranty ?? 'none');
    if (!WARRANTIES.includes(warranty)) throw new Error('Warranty must be 1 week, 2 weeks, 1 month or none');

    let device = null;
    let problem = null;
    let repairId = null;
    if (type === 'repair') {
        device = requiredText(input.device, 'Device', MAX_DEVICE);
        problem = requiredText(input.problem, 'Problem', MAX_PROBLEM);
        // An invoice made from a repair job points back at it (one invoice per repair).
        if (input.repair_id !== null && input.repair_id !== undefined && input.repair_id !== '') {
            const id = Number(input.repair_id);
            const repair = Number.isInteger(id) && id > 0 ? await Repair.findById(id) : null;
            if (!repair) throw new Error('That repair no longer exists');
            repairId = repair.id;
        }
    }

    let pickupDate = null;
    let bookingId = null;
    if (type === 'booking') {
        pickupDate = cleanDate(input.pickup_date, 'Pickup date');
        if (pickupDate < invoiceDate) throw new Error('Pickup date cannot be before the invoice date');
        if (input.booking_id !== null && input.booking_id !== undefined && input.booking_id !== '') {
            const id = Number(input.booking_id);
            const booking = Number.isInteger(id) && id > 0 ? await Booking.findById(id) : null;
            if (!booking) throw new Error('That booking no longer exists');
            bookingId = booking.id;
        }
    }

    return {
        number, type, invoice_date: invoiceDate,
        customer_name: optionalText(input.customer_name, 'Customer name', 100),
        phone: cleanPhone(input.phone), telegram: cleanTelegram(input.telegram),
        device, problem, pickup_date: pickupDate, booking_id: bookingId, repair_id: repairId,
        warranty, items, total, deposit
    };
}

// A second invoice for the same number / the same booking is refused by the database; say which one in plain words.
function explain(error, number) {
    if (error && error.code === 'ER_DUP_ENTRY') {
        if (/uq_invoices_booking/.test(error.sqlMessage || '')) return new Error('This booking already has an invoice');
        if (/uq_invoices_repair/.test(error.sqlMessage || '')) return new Error('This repair already has an invoice');
        return new Error(`Invoice number ${printed(number)} is already used`);
    }
    return error;
}

// ---------- the service ----------

class InvoiceService {
    // The number the next invoice gets: one more than the highest so far (the very first is 000041).
    static async getNextNumber() {
        const highest = await Invoice.highestNumber();
        return highest === null ? START_NUMBER : Math.max(highest + 1, START_NUMBER);
    }

    static async getAllInvoices(type) {
        if (type && !MAX_LINES[type]) throw new Error('Type must be sale, booking or repair');
        return Invoice.findAll({ type });
    }

    static async getInvoiceById(id) {
        const invoice = await Invoice.findById(id);
        if (!invoice) throw notFound();
        return invoice;
    }

    // `number` and `invoice_date` can be left out: the next number and today are used.
    static async createInvoice(data) {
        const input = { ...(data || {}) };
        const today = new Date();
        const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        if (!input.invoice_date) input.invoice_date = todayText;

        const chosen = input.number !== undefined && input.number !== null && input.number !== '';
        // When the number is picked automatically, people saving at the same moment could pick the same one:
        // whoever lost waits a moment and picks the next free one.
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            if (!chosen) input.number = await InvoiceService.getNextNumber();
            const clean = await prepare(input);
            try {
                const id = await Invoice.create(clean);
                return await Invoice.findById(id);
            } catch (error) {
                const taken = error && error.code === 'ER_DUP_ENTRY' && !/uq_invoices_(booking|repair)/.test(error.sqlMessage || '');
                if (!chosen && taken && attempt < ATTEMPTS - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 40));
                    continue;
                }
                throw explain(error, clean.number);
            }
        }
        throw new Error('Could not pick an invoice number. Please try again.');
    }

    // Send only what changed; the rest is kept and the whole invoice is checked again. The type never changes.
    static async updateInvoice(id, data) {
        const current = await Invoice.findById(id);
        if (!current) throw notFound();
        if (data && data.type !== undefined && data.type !== current.type) throw new Error('The type of an invoice cannot be changed');

        const merged = {
            number: current.number, type: current.type, invoice_date: current.invoice_date,
            customer_name: current.customer_name, phone: current.phone, telegram: current.telegram,
            device: current.device, problem: current.problem, pickup_date: current.pickup_date, booking_id: current.booking_id,
            repair_id: current.repair_id,
            warranty: current.warranty, items: current.items, deposit: current.deposit,
            ...(data || {}), type: current.type
        };
        const clean = await prepare(merged);
        try {
            await Invoice.update(id, clean);
        } catch (error) {
            throw explain(error, clean.number);
        }
        return Invoice.findById(id);
    }

    static async deleteInvoice(id) {
        const deleted = await Invoice.delete(id);
        if (!deleted) throw notFound();
        return { message: 'Invoice deleted successfully' };
    }
}

module.exports = InvoiceService;
