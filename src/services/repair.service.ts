import { RepairStatus } from '../enums/repair-status.enum';
import { badRequest, notFound } from '../errors/app-error';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { ProductRepository } from '../repositories/product.repository';
import { RepairCounts, RepairFilters, RepairInput, RepairRecord, RepairRepository } from '../repositories/repair.repository';
import { cleanDate, cleanMoney, cleanPhone, cleanTelegram, optionalText, todayText } from '../utils/clean';
import { Page, PageRequest, toPage } from '../utils/pagination';
import { cleanSearch } from '../utils/search';
import { Body } from '../utils/types';
import { cleanUploadedPhotos } from '../utils/uploads';
import { removeFilesNobodyUses } from './photo.service';
import { StockHold } from './stock-hold.service';

const STATUSES = Object.values(RepairStatus);
const MAX_DEVICE = 80;     // one line on the printed invoice
const MAX_PROBLEM = 140;   // two lines on the printed invoice
const MAX_CUSTOMER = 100;
const MAX_PHOTOS = 4;      // photos of what is wrong

/** The numbers a screen shows beside a page of repairs. */
export interface RepairMeta { counts: RepairCounts }

/** What the address narrows the list to: ?status=fixed&search=dell (all optional, and checked). */
function filtersOf(query: Body): RepairFilters {
    const status = query.status === undefined ? '' : String(query.status);
    if (status && !STATUSES.includes(status as RepairStatus)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}`);
    return { status: status || undefined, search: cleanSearch(query.search) || undefined };
}

// Checks a COMPLETE repair and returns it in the shape the repository saves.
async function prepare(source: Body): Promise<Omit<RepairInput, 'stock_held'>> {
    let input = source;
    let productId: number | null = null;
    if (input.product_id !== null && input.product_id !== undefined && input.product_id !== '') {
        const id = Number(input.product_id);
        const product = Number.isInteger(id) && id > 0 ? await ProductRepository.findById(id) : null;
        if (!product) throw badRequest('That product no longer exists');
        productId = product.id;
        if (!String(input.device ?? '').trim()) input = { ...input, device: String(product.name).slice(0, MAX_DEVICE) };
    }

    const device = optionalText(input.device, 'Device', MAX_DEVICE);
    if (!device) throw badRequest('Laptop or device is required');
    const problem = optionalText(input.problem, 'Problem', MAX_PROBLEM);
    if (!problem) throw badRequest('Please write what is wrong');

    const status = String(input.status ?? RepairStatus.RECEIVED) as RepairStatus;
    if (!STATUSES.includes(status)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}`);

    const receivedDate = cleanDate(input.received_date, 'Received date');
    let backOn: string | null = null;
    if (input.back_on !== null && input.back_on !== undefined && input.back_on !== '') {
        backOn = cleanDate(input.back_on, 'Back-on date');
        if (backOn < receivedDate) throw badRequest('The back-on date cannot be before the received date');
    }

    let cost: number | null = null;
    if (input.cost !== null && input.cost !== undefined && input.cost !== '') cost = cleanMoney(input.cost, 'Cost');

    // The sale of this laptop (when we sold it): only a real Sale counts.
    let saleInvoiceId: number | null = null;
    if (input.sale_invoice_id !== null && input.sale_invoice_id !== undefined && input.sale_invoice_id !== '') {
        const id = Number(input.sale_invoice_id);
        const sale = Number.isInteger(id) && id > 0 ? await InvoiceRepository.findById(id) : null;
        if (!sale || sale.type !== 'sale') throw badRequest('That sale no longer exists');
        saleInvoiceId = sale.id;
    }

    // The dates of the steps follow the status: "fixed" has a fixed date, "picked up" also a pickup date.
    const today = todayText();
    const fixedDate = status === RepairStatus.RECEIVED ? null : cleanDate(input.fixed_date || today, 'Fixed date');
    const pickedUpDate = status === RepairStatus.PICKED_UP ? cleanDate(input.picked_up_date || today, 'Pickup date') : null;

    return {
        product_id: productId, device,
        customer_name: optionalText(input.customer_name, 'Customer name', MAX_CUSTOMER),
        phone: cleanPhone(input.phone), telegram: cleanTelegram(input.telegram),
        problem, received_date: receivedDate, back_on: backOn, cost, status,
        fixed_date: fixedDate, picked_up_date: pickedUpDate, sale_invoice_id: saleInvoiceId,
        images: cleanUploadedPhotos(input.images, 'repair', MAX_PHOTOS)
    };
}

export class RepairService {
    static async getAllRepairs(query: Body = {}): Promise<RepairRecord[]> {
        return RepairRepository.findAll(filtersOf(query));
    }

    // One page of the same list. `meta.counts` are the numbers of the tabs: how many repairs are in each step.
    static async getRepairPage(query: Body, page: PageRequest): Promise<Page<RepairRecord, RepairMeta>> {
        const { rows, total } = await RepairRepository.findPage(filtersOf(query), page);
        return toPage(page, total, rows, { counts: await RepairRepository.statusCounts() });
    }

    static async getRepairById(id: string): Promise<RepairRecord> {
        const repair = await RepairRepository.findById(id);
        if (!repair) throw notFound('Repair');
        return repair;
    }

    // `received_date` can be left out: today is used.
    // A repair of one of the shop's laptops takes it off the shelf while it is 'received' (see StockHold).
    static async createRepair(data: Body): Promise<RepairRecord | undefined> {
        const clean = await prepare({ received_date: todayText(), ...(data || {}) });
        const held = clean.product_id !== null && clean.status === RepairStatus.RECEIVED ? await StockHold.holdForRepair(clean.product_id) : false;
        let id: number;
        try {
            id = await RepairRepository.create({ ...clean, stock_held: held });
        } catch (error) {
            if (held) await StockHold.release(clean.product_id);
            throw error;
        }
        return RepairRepository.findById(id);
    }

    // Send only what changed (e.g. { status: 'fixed' }); the rest is kept, and the whole repair is checked again.
    static async updateRepair(id: string, data: Body): Promise<RepairRecord | undefined> {
        const current = await RepairRepository.findById(id);
        if (!current) throw notFound('Repair');

        const merged: Body = {
            product_id: current.product_id, device: current.device, customer_name: current.customer_name,
            phone: current.phone, telegram: current.telegram, problem: current.problem,
            received_date: current.received_date, back_on: current.back_on, cost: current.cost, status: current.status,
            fixed_date: current.fixed_date, picked_up_date: current.picked_up_date, sale_invoice_id: current.sale_invoice_id,
            images: current.images,
            ...(data || {})
        };
        // Going back a step forgets the later dates; going forward fills them in (prepare does that from the status).
        if (data && data.status !== undefined && data.status !== current.status) {
            if (data.fixed_date === undefined) merged.fixed_date = current.status === RepairStatus.RECEIVED ? null : current.fixed_date;
            if (data.picked_up_date === undefined) merged.picked_up_date = current.status === RepairStatus.PICKED_UP ? current.picked_up_date : null;
        }
        const clean = await prepare(merged);

        // The laptop is off the shelf only while the repair is 'received': fixed (or picked up) gives it back, going back to
        // 'received' takes it again, and another laptop moves the hold to it.
        const wasHeld = current.stock_held && current.status === RepairStatus.RECEIVED;
        const sameProduct = clean.product_id === current.product_id;
        const willHold = clean.product_id !== null && clean.status === RepairStatus.RECEIVED;
        let held = wasHeld && willHold && sameProduct;
        if (willHold && !held) held = await StockHold.holdForRepair(clean.product_id as number);
        if (wasHeld && !(willHold && sameProduct)) await StockHold.release(current.product_id);

        await RepairRepository.update(id, { ...clean, stock_held: held });
        await removeFilesNobodyUses(current.images.filter(url => !clean.images.includes(url)));      // a photo taken off the repair
        return RepairRepository.findById(id);
    }

    static async deleteRepair(id: string): Promise<{ message: string }> {
        const current = await RepairRepository.findById(id);
        const deleted = await RepairRepository.delete(id);
        if (!deleted) throw notFound('Repair');
        // A repair that still held its laptop gives it back.
        if (current && current.stock_held && current.status === RepairStatus.RECEIVED) await StockHold.release(current.product_id);
        await removeFilesNobodyUses(current ? current.images : []);
        return { message: 'Repair deleted successfully' };
    }
}
