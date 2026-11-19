const Repair = require('../models/Repair');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const StockHold = require('./stockHoldService');
const { cleanMoney, cleanPhone, cleanTelegram, cleanDate } = require('../utils/clean');
const { cleanUploadedPhotos } = require('../utils/uploads');
const { removeFilesNobodyUses } = require('./photoService');

const STATUSES = ['received', 'fixed', 'picked_up'];
const MAX_DEVICE = 80;     // one line on the printed invoice
const MAX_PROBLEM = 140;   // two lines on the printed invoice
const MAX_CUSTOMER = 100;
const MAX_PHOTOS = 4;      // photos of what is wrong

const notFound = () => Object.assign(new Error('Repair not found'), { statusCode: 404 });

const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function optionalText(value, what, max) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (text.length > max) throw new Error(`${what} is too long (max ${max} characters)`);
    return text || null;
}

// Checks a COMPLETE repair and returns it in the shape the model saves.
async function prepare(input) {
    let productId = null;
    if (input.product_id !== null && input.product_id !== undefined && input.product_id !== '') {
        const id = Number(input.product_id);
        const product = Number.isInteger(id) && id > 0 ? await Product.findById(id) : null;
        if (!product) throw new Error('That product no longer exists');
        productId = product.id;
        if (!String(input.device ?? '').trim()) input = { ...input, device: String(product.name).slice(0, MAX_DEVICE) };
    }

    const device = optionalText(input.device, 'Device', MAX_DEVICE);
    if (!device) throw new Error('Laptop or device is required');
    const problem = optionalText(input.problem, 'Problem', MAX_PROBLEM);
    if (!problem) throw new Error('Please write what is wrong');

    const status = String(input.status ?? 'received');
    if (!STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);

    const receivedDate = cleanDate(input.received_date, 'Received date');
    let backOn = null;
    if (input.back_on !== null && input.back_on !== undefined && input.back_on !== '') {
        backOn = cleanDate(input.back_on, 'Back-on date');
        if (backOn < receivedDate) throw new Error('The back-on date cannot be before the received date');
    }

    let cost = null;
    if (input.cost !== null && input.cost !== undefined && input.cost !== '') cost = cleanMoney(input.cost, 'Cost');

    // The sale of this laptop (when we sold it): only a real Sale counts.
    let saleInvoiceId = null;
    if (input.sale_invoice_id !== null && input.sale_invoice_id !== undefined && input.sale_invoice_id !== '') {
        const id = Number(input.sale_invoice_id);
        const sale = Number.isInteger(id) && id > 0 ? await Invoice.findById(id) : null;
        if (!sale || sale.type !== 'sale') throw new Error('That sale no longer exists');
        saleInvoiceId = sale.id;
    }

    // The dates of the steps follow the status: "fixed" has a fixed date, "picked up" also a pickup date.
    const today = todayText();
    const fixedDate = status === 'received' ? null : cleanDate(input.fixed_date || today, 'Fixed date');
    const pickedUpDate = status === 'picked_up' ? cleanDate(input.picked_up_date || today, 'Pickup date') : null;

    return {
        product_id: productId, device,
        customer_name: optionalText(input.customer_name, 'Customer name', MAX_CUSTOMER),
        phone: cleanPhone(input.phone), telegram: cleanTelegram(input.telegram),
        problem, received_date: receivedDate, back_on: backOn, cost, status,
        fixed_date: fixedDate, picked_up_date: pickedUpDate, sale_invoice_id: saleInvoiceId,
        images: cleanUploadedPhotos(input.images, 'repair', MAX_PHOTOS)
    };
}

class RepairService {
    static async getAllRepairs(status) {
        if (status && !STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);
        return Repair.findAll({ status });
    }

    static async getRepairById(id) {
        const repair = await Repair.findById(id);
        if (!repair) throw notFound();
        return repair;
    }

    // `received_date` can be left out: today is used.
    // A repair of one of the shop's laptops takes it off the shelf while it is 'received' (see StockHold).
    static async createRepair(data) {
        const clean = await prepare({ received_date: todayText(), ...(data || {}) });
        const held = clean.product_id !== null && clean.status === 'received' ? await StockHold.holdForRepair(clean.product_id) : false;
        let id;
        try {
            id = await Repair.create({ ...clean, stock_held: held });
        } catch (error) {
            if (held) await StockHold.release(clean.product_id);
            throw error;
        }
        return Repair.findById(id);
    }

    // Send only what changed (e.g. { status: 'fixed' }); the rest is kept, and the whole repair is checked again.
    static async updateRepair(id, data) {
        const current = await Repair.findById(id);
        if (!current) throw notFound();

        const merged = {
            product_id: current.product_id, device: current.device, customer_name: current.customer_name,
            phone: current.phone, telegram: current.telegram, problem: current.problem,
            received_date: current.received_date, back_on: current.back_on, cost: current.cost, status: current.status,
            fixed_date: current.fixed_date, picked_up_date: current.picked_up_date, sale_invoice_id: current.sale_invoice_id,
            images: current.images,
            ...(data || {})
        };
        // Going back a step forgets the later dates; going forward fills them in (prepare does that from the status).
        if (data && data.status !== undefined && data.status !== current.status) {
            if (data.fixed_date === undefined) merged.fixed_date = current.status === 'received' ? null : current.fixed_date;
            if (data.picked_up_date === undefined) merged.picked_up_date = current.status === 'picked_up' ? current.picked_up_date : null;
        }
        const clean = await prepare(merged);

        // The laptop is off the shelf only while the repair is 'received': fixed (or picked up) gives it back, going back to
        // 'received' takes it again, and another laptop moves the hold to it.
        const wasHeld = current.stock_held && current.status === 'received';
        const sameProduct = clean.product_id === current.product_id;
        const willHold = clean.product_id !== null && clean.status === 'received';
        let held = wasHeld && willHold && sameProduct;
        if (willHold && !held) held = await StockHold.holdForRepair(clean.product_id);
        if (wasHeld && !(willHold && sameProduct)) await StockHold.release(current.product_id);

        await Repair.update(id, { ...clean, stock_held: held });
        await removeFilesNobodyUses(current.images.filter(url => !clean.images.includes(url)));      // a photo taken off the repair
        return Repair.findById(id);
    }

    static async deleteRepair(id) {
        const current = await Repair.findById(id);
        const deleted = await Repair.delete(id);
        if (!deleted) throw notFound();
        // A repair that still held its laptop gives it back.
        if (current && current.stock_held && current.status === 'received') await StockHold.release(current.product_id);
        await removeFilesNobodyUses(current ? current.images : []);
        return { message: 'Repair deleted successfully' };
    }
}

module.exports = RepairService;
