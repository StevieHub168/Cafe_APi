import { isDuplicateEntry, sqlMessageOf } from '../database/db-errors';
import { InvoiceType } from '../enums/invoice-type.enum';
import { Warranty } from '../enums/warranty.enum';
import { badRequest, conflict, notFound } from '../errors/app-error';
import { InvoiceItem } from '../models/invoice.model';
import { BookingRepository } from '../repositories/booking.repository';
import { InvoiceCounts, InvoiceFilters, InvoiceInput, InvoiceRecord, InvoiceRepository } from '../repositories/invoice.repository';
import { RepairRepository } from '../repositories/repair.repository';
import { cleanDate, cleanMoney, cleanPhone, cleanTelegram, optionalText, todayText } from '../utils/clean';
import { Page, PageRequest, toPage } from '../utils/pagination';
import { cleanSearch } from '../utils/search';
import { Body } from '../utils/types';

// How many lines fit on the printed paper of each kind (the paper is A5).
const MAX_LINES: Record<InvoiceType, number> = { [InvoiceType.SALE]: 9, [InvoiceType.BOOKING]: 5, [InvoiceType.REPAIR]: 7 };
const WARRANTIES = Object.values(Warranty);

// Digital invoices continue the paper pad: the first one is 000041. (INVOICE_START_NUMBER changes it.)
const START_NUMBER = Number(process.env.INVOICE_START_NUMBER) || 41;
const MAX_NUMBER = 999999;
// What still fits on the printed paper without being cut off.
const MAX_NAME = 90;       // an item name (two lines in its row)
const MAX_DEVICE = 80;     // one line
const MAX_PROBLEM = 140;   // two lines
const ATTEMPTS = 10;   // how often to pick a new automatic number when it was taken a moment ago

const printed = (number: number) => String(number).padStart(6, '0');
const round2 = (n: number) => Math.round(n * 100) / 100;
const isType = (type: string): type is InvoiceType => Object.prototype.hasOwnProperty.call(MAX_LINES, type);
const PERIODS = ['month', 'warranty'];

/** The numbers a screen shows beside a page of invoices. */
export interface InvoiceMeta { counts: InvoiceCounts }

/** What the address narrows the list to: ?type=sale&period=month&search=dell (all optional, and checked). */
function filtersOf(query: Body): InvoiceFilters {
    const type = query.type === undefined ? '' : String(query.type);
    if (type && !isType(type)) throw badRequest('Type must be sale, booking or repair');
    const period = query.period === undefined ? '' : String(query.period);
    if (period && !PERIODS.includes(period)) throw badRequest('Period must be month or warranty');
    return { type: type || undefined, period: period || undefined, search: cleanSearch(query.search) || undefined };
}

// ---------- the items ----------

// A row with no name and no price is an empty row of the form: ignored. Anything else must be complete.
function cleanItems(list: unknown, type: InvoiceType): InvoiceItem[] {
    if (!Array.isArray(list)) throw badRequest('Add at least one item');
    const rows = list.filter(r => r && (String(r.name ?? '').trim() !== '' || (r.unit_price !== '' && r.unit_price !== null && r.unit_price !== undefined)));
    if (rows.length === 0) throw badRequest('Add at least one item');
    if (rows.length > MAX_LINES[type]) throw badRequest(`A ${type} invoice has room for ${MAX_LINES[type]} items`);

    return rows.map((r, i) => {
        const name = String(r.name ?? '').trim().replace(/\s+/g, ' ');
        if (!name) throw badRequest(`Item ${i + 1}: please write the name`);
        if (name.length > MAX_NAME) throw badRequest(`Item ${i + 1}: the name is too long (max ${MAX_NAME} characters)`);
        const qty = Number(r.qty ?? 1);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw badRequest(`Item ${i + 1}: quantity must be a whole number from 1 to 999`);
        return { name, qty, unit_price: cleanMoney(r.unit_price, `Item ${i + 1}: price`) };
    });
}

// ---------- one complete invoice ----------

function requiredText(value: unknown, what: string, max: number): string {
    const text = optionalText(value, what, max);
    if (!text) throw badRequest(`${what} is required`);
    return text;
}

// Checks a COMPLETE invoice and returns it in the shape the repository saves. (`number` is already decided here.)
async function prepare(input: Body): Promise<InvoiceInput> {
    const typeText = String(input.type ?? '');
    if (!isType(typeText)) throw badRequest('Type must be sale, booking or repair');
    const type = typeText;

    const number = Number(input.number);
    if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) throw badRequest(`Invoice number must be a whole number from 1 to ${MAX_NUMBER}`);

    const invoiceDate = cleanDate(input.invoice_date, 'Date');

    const items = cleanItems(input.items, type);
    const total = round2(items.reduce((sum, item) => sum + item.qty * item.unit_price, 0));
    if (total <= 0) throw badRequest('The total must be more than 0');
    const deposit = cleanMoney(input.deposit ?? 0, 'Deposit');
    if (deposit > total) throw badRequest('Deposit cannot be more than the total');

    const warranty = String(input.warranty ?? Warranty.NONE) as Warranty;
    if (!WARRANTIES.includes(warranty)) throw badRequest('Warranty must be 1 week, 2 weeks, 1 month or none');

    let device: string | null = null;
    let problem: string | null = null;
    let repairId: number | null = null;
    if (type === InvoiceType.REPAIR) {
        device = requiredText(input.device, 'Device', MAX_DEVICE);
        problem = requiredText(input.problem, 'Problem', MAX_PROBLEM);
        // An invoice made from a repair job points back at it (one invoice per repair).
        if (input.repair_id !== null && input.repair_id !== undefined && input.repair_id !== '') {
            const id = Number(input.repair_id);
            const repair = Number.isInteger(id) && id > 0 ? await RepairRepository.findById(id) : null;
            if (!repair) throw badRequest('That repair no longer exists');
            repairId = repair.id;
        }
    }

    let pickupDate: string | null = null;
    let bookingId: number | null = null;
    if (type === InvoiceType.BOOKING) {
        pickupDate = cleanDate(input.pickup_date, 'Pickup date');
        if (pickupDate < invoiceDate) throw badRequest('Pickup date cannot be before the invoice date');
        if (input.booking_id !== null && input.booking_id !== undefined && input.booking_id !== '') {
            const id = Number(input.booking_id);
            const booking = Number.isInteger(id) && id > 0 ? await BookingRepository.findById(id) : null;
            if (!booking) throw badRequest('That booking no longer exists');
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
function explain(error: unknown, number: number): unknown {
    if (isDuplicateEntry(error)) {
        const message = sqlMessageOf(error);
        if (/uq_invoices_booking/.test(message)) return conflict('This booking already has an invoice');
        if (/uq_invoices_repair/.test(message)) return conflict('This repair already has an invoice');
        return conflict(`Invoice number ${printed(number)} is already used`);
    }
    return error;
}

// ---------- the service ----------

export class InvoiceService {
    // The number the next invoice gets: one more than the highest so far (the very first is 000041).
    static async getNextNumber(): Promise<number> {
        const highest = await InvoiceRepository.highestNumber();
        return highest === null ? START_NUMBER : Math.max(highest + 1, START_NUMBER);
    }

    static async getAllInvoices(query: Body = {}): Promise<InvoiceRecord[]> {
        return InvoiceRepository.findAll(filtersOf(query));
    }

    // One page of the same list. `meta.counts` are the numbers of the Sales tabs (not narrowed by the search or the period).
    static async getInvoicePage(query: Body, page: PageRequest): Promise<Page<InvoiceRecord, InvoiceMeta>> {
        const filters = filtersOf(query);
        const { rows, total } = await InvoiceRepository.findPage(filters, page);
        return toPage(page, total, rows, { counts: await InvoiceRepository.counts(filters.type) });
    }

    static async getInvoiceById(id: string): Promise<InvoiceRecord> {
        const invoice = await InvoiceRepository.findById(id);
        if (!invoice) throw notFound('Invoice');
        return invoice;
    }

    // `number` and `invoice_date` can be left out: the next number and today are used.
    static async createInvoice(data: Body): Promise<InvoiceRecord | undefined> {
        const input: Body = { ...(data || {}) };
        if (!input.invoice_date) input.invoice_date = todayText();

        const chosen = input.number !== undefined && input.number !== null && input.number !== '';
        // When the number is picked automatically, people saving at the same moment could pick the same one:
        // whoever lost waits a moment and picks the next free one.
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            if (!chosen) input.number = await InvoiceService.getNextNumber();
            const clean = await prepare(input);
            try {
                const id = await InvoiceRepository.create(clean);
                return await InvoiceRepository.findById(id);
            } catch (error) {
                const taken = isDuplicateEntry(error) && !/uq_invoices_(booking|repair)/.test(sqlMessageOf(error));
                if (!chosen && taken && attempt < ATTEMPTS - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 40));
                    continue;
                }
                throw explain(error, clean.number);
            }
        }
        throw conflict('Could not pick an invoice number. Please try again.');
    }

    // Send only what changed; the rest is kept and the whole invoice is checked again. The type never changes.
    static async updateInvoice(id: string, data: Body): Promise<InvoiceRecord | undefined> {
        const current = await InvoiceRepository.findById(id);
        if (!current) throw notFound('Invoice');
        if (data && data.type !== undefined && data.type !== current.type) throw badRequest('The type of an invoice cannot be changed');

        const merged: Body = {
            number: current.number, invoice_date: current.invoice_date,
            customer_name: current.customer_name, phone: current.phone, telegram: current.telegram,
            device: current.device, problem: current.problem, pickup_date: current.pickup_date, booking_id: current.booking_id,
            repair_id: current.repair_id,
            warranty: current.warranty, items: current.items, deposit: current.deposit,
            ...(data || {}), type: current.type
        };
        const clean = await prepare(merged);
        try {
            await InvoiceRepository.update(id, clean);
        } catch (error) {
            throw explain(error, clean.number);
        }
        return InvoiceRepository.findById(id);
    }

    static async deleteInvoice(id: string): Promise<{ message: string }> {
        const deleted = await InvoiceRepository.delete(id);
        if (!deleted) throw notFound('Invoice');
        return { message: 'Invoice deleted successfully' };
    }
}
