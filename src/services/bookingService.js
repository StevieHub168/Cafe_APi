const Booking = require('../models/Booking');
const Product = require('../models/Product');
const InvoiceService = require('./invoiceService');
const StockHold = require('./stockHoldService');
const { PUBLIC_PREFIX, isUploadName, removeImage } = require('../utils/uploads');
const { cleanMoney, cleanPhone, cleanTelegram, cleanDate } = require('../utils/clean');

const STATUSES = ['booked', 'picked_up', 'cancelled'];
const MAX_PHOTOS = 4;
const WARRANTIES = ['1_week', '2_weeks', '1_month', 'none'];
const MAX_ITEM_NAME = 90;      // what fits on one line of the printed invoice

const notFound = () => Object.assign(new Error('Booking not found'), { statusCode: 404 });
// Someone else already did it (or it is not in the right state): 409, so the screen can say "just booked / just picked up".
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });
const STATUS_WORDS = { picked_up: 'picked up', cancelled: 'cancelled', booked: 'booked' };

// ---------- cleaning each field (cleanMoney / cleanPhone / cleanTelegram / cleanDate come from utils/clean.js) ----------

// Photos of a booking (e.g. the deposit receipt): only files uploaded through this app, at most 4, no repeats.
function cleanPhotos(list) {
    if (list === null || list === undefined || list === '') return [];
    if (!Array.isArray(list)) throw new Error('Photos must be a list');
    const photos = [];
    for (const item of list) {
        const url = String(item ?? '').trim();
        if (!url.startsWith(PUBLIC_PREFIX) || !isUploadName(url.slice(PUBLIC_PREFIX.length))) {
            throw new Error('A booking photo must be one uploaded from this app');
        }
        if (!photos.includes(url)) photos.push(url);
    }
    if (photos.length > MAX_PHOTOS) throw new Error(`A booking can have at most ${MAX_PHOTOS} photos`);
    return photos;
}

// Deletes uploaded files that nothing uses any more (a photo removed from a booking, or a booking that was deleted).
// Called AFTER the database changed, so "in use" already reflects the new state.
async function removeFilesNobodyUses(urls) {
    for (const url of urls) {
        if (!(await Product.usesPhoto(url)) && !(await Booking.usesPhoto(url))) removeImage(url);
    }
}

// Checks a COMPLETE booking and returns it in the shape the model saves.
async function prepare(input) {
    let productId = null;
    if (input.product_id !== null && input.product_id !== undefined && input.product_id !== '') {
        const id = Number(input.product_id);
        const product = Number.isInteger(id) && id > 0 ? await Product.findById(id) : null;
        if (!product) throw new Error('That product no longer exists');
        productId = product.id;
        if (!String(input.product_name ?? '').trim()) input = { ...input, product_name: product.name };
    }

    const productName = String(input.product_name ?? '').trim().replace(/\s+/g, ' ');
    if (!productName) throw new Error('Product is required');
    if (productName.length > 255) throw new Error('Product is too long (max 255 characters)');

    const phone = cleanPhone(input.phone);
    const telegram = cleanTelegram(input.telegram);
    if (!phone && !telegram) throw new Error('Add a phone number or a Telegram username so the customer can be reached');

    const fullPrice = cleanMoney(input.full_price, 'Full price');
    if (fullPrice <= 0) throw new Error('Full price must be more than 0');
    const deposit = cleanMoney(input.deposit ?? 0, 'Deposit');
    if (deposit > fullPrice) throw new Error('Deposit cannot be more than the full price');

    const bookingDate = cleanDate(input.booking_date, 'Booking date');
    const pickupDate = cleanDate(input.pickup_date, 'Pickup date');
    if (pickupDate < bookingDate) throw new Error('Pickup date cannot be before the booking date');

    const status = String(input.status ?? 'booked');
    if (!STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);

    return {
        product_id: productId, product_name: productName, phone, telegram,
        full_price: fullPrice, deposit, booking_date: bookingDate, pickup_date: pickupDate, status,
        images: cleanPhotos(input.images)
    };
}

// The laptop of a picked-up booking is SOLD. Never throws: the Sale is already made, so a problem here is only reported ('failed').
//   'hidden'        a single laptop: archived (hidden from the Menu)
//   'stock_kept'    counted stock whose unit was already taken when it was booked: stays as it is
//   'stock_lowered' counted stock of an OLD booking (made before bookings took a unit): one less now
//   'none'          no laptop of the shop
async function markLaptopSold(booking) {
    if (!booking.product_id) return 'none';
    try {
        const product = await Product.findById(booking.product_id);
        if (!product) return 'none';
        if (product.track_stock) {
            if (booking.stock_held) {
                await Booking.clearStockHeld(booking.id);
                return 'stock_kept';
            }
            await Product.update(product.id, { stock_quantity: Math.max(0, Number(product.stock_quantity) - 1) });
            return 'stock_lowered';
        }
        await Product.markSold(product.id);          // archived, and no longer "set aside"
        await Booking.clearStockHeld(booking.id);
        return 'hidden';
    } catch {
        return 'failed';
    }
}

// ---------- the service ----------

class BookingService {
    static async getAllBookings(status) {
        if (status && !STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);
        return Booking.findAll({ status });
    }

    static async getBookingById(id) {
        const booking = await Booking.findById(id);
        if (!booking) throw notFound();
        return booking;
    }

    // A booking of one of the shop's laptops takes it off the shelf (see StockHold): counted stock one less, a single laptop set aside.
    static async createBooking(data) {
        const clean = await prepare(data || {});
        const held = clean.product_id !== null && clean.status === 'booked' ? await StockHold.holdForBooking(clean.product_id) : false;
        let id;
        try {
            id = await Booking.create({ ...clean, stock_held: held });
        } catch (error) {
            if (held) await StockHold.release(clean.product_id);
            throw error;
        }
        return Booking.findById(id);
    }

    // Send only what changed (e.g. { status: 'picked_up' }); the rest is kept, and the whole booking is checked again.
    static async updateBooking(id, data) {
        const current = await Booking.findById(id);
        if (!current) throw notFound();

        const merged = {
            product_id: current.product_id, product_name: current.product_name, phone: current.phone, telegram: current.telegram,
            full_price: current.full_price, deposit: current.deposit,
            booking_date: current.booking_date, pickup_date: current.pickup_date, status: current.status,
            images: current.images,
            ...(data || {})
        };
        const clean = await prepare(merged);

        // The laptop follows the booking: it is taken while the booking is 'booked' and given back when it is cancelled, or when
        // another laptop is chosen. A booking picked up the "old way" (status set by hand) SELLS the laptop. The new hold is taken
        // FIRST, so when it is refused (a single laptop that is not free) nothing has changed yet.
        const wasHeld = current.stock_held && current.status === 'booked';
        const sameProduct = clean.product_id === current.product_id;
        const willHold = clean.product_id !== null && clean.status === 'booked';
        let held = wasHeld && willHold && sameProduct;
        if (willHold && !held) held = await StockHold.holdForBooking(clean.product_id);
        if (wasHeld && !(willHold && sameProduct)) {
            if (clean.status === 'picked_up' && sameProduct) await StockHold.sold(current.product_id);
            else await StockHold.release(current.product_id);
        }

        await Booking.update(id, { ...clean, stock_held: held });
        await removeFilesNobodyUses(current.images.filter(url => !clean.images.includes(url)));
        return Booking.findById(id);
    }

    // "The customer picked it up": ONE step that does everything or nothing.
    //   1. the booking becomes 'picked_up' (the first person to ask wins; a second one gets a 409),
    //   2. a SALE invoice is made, paid in full (the deposit already paid + the rest collected now),
    //   3. the booking remembers that Sale,
    //   4. the laptop is marked as sold (hidden from the Menu, or one less in stock).
    // When the Sale cannot be made the booking goes back to 'booked'. Body (all optional): customer_name, phone, telegram, warranty.
    static async pickUp(id, body) {
        const input = body || {};
        const booking = await Booking.findById(id);
        if (!booking) throw notFound();
        if (booking.status !== 'booked') throw conflict(`This booking is already ${STATUS_WORDS[booking.status] || booking.status}`);

        // Everything typed is checked BEFORE anything changes.
        const warranty = String(input.warranty ?? 'none');
        if (!WARRANTIES.includes(warranty)) throw new Error('Warranty must be 1 week, 2 weeks, 1 month or none');
        const phone = input.phone === undefined ? booking.phone : cleanPhone(input.phone);
        const telegram = input.telegram === undefined ? booking.telegram : cleanTelegram(input.telegram);
        const customerName = String(input.customer_name ?? '').trim().replace(/\s+/g, ' ');
        if (customerName.length > 100) throw new Error('Customer name is too long (max 100 characters)');

        if (!(await Booking.claimPickup(id))) throw conflict('Someone just picked this booking up');

        let invoice;
        try {
            invoice = await InvoiceService.createInvoice({
                type: 'sale',
                customer_name: customerName || null, phone, telegram,
                warranty,
                items: [{ name: booking.product_name.slice(0, MAX_ITEM_NAME).trim(), qty: 1, unit_price: booking.full_price }],
                deposit: booking.full_price
            });
        } catch (error) {
            await Booking.releasePickup(id);
            throw error;
        }
        await Booking.setSaleInvoice(id, invoice.id);

        const laptop = await markLaptopSold(booking);   // before reading the booking again: it may stop "holding" the laptop
        return { booking: await Booking.findById(id), invoice, laptop };
    }

    static async deleteBooking(id) {
        const current = await Booking.findById(id);
        const deleted = await Booking.delete(id);
        if (!deleted) throw notFound();
        // A booking that still held its laptop gives it back.
        if (current && current.stock_held && current.status === 'booked') await StockHold.release(current.product_id);
        await removeFilesNobodyUses(current ? current.images : []);
        return { message: 'Booking deleted successfully' };
    }
}

module.exports = BookingService;
