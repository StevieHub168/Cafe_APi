import { BookingStatus } from '../enums/booking-status.enum';
import { InvoiceType } from '../enums/invoice-type.enum';
import { LaptopOutcome } from '../enums/laptop-outcome.enum';
import { TelegramGroup } from '../enums/telegram-group.enum';
import { Warranty } from '../enums/warranty.enum';
import { badRequest, conflict, notFound } from '../errors/app-error';
import { BookingCounts, BookingFilters, BookingInput, BookingRecord, BookingRepository } from '../repositories/booking.repository';
import { InvoiceRecord } from '../repositories/invoice.repository';
import { ProductRepository } from '../repositories/product.repository';
import { cleanDate, cleanMoney, cleanPhone, cleanTelegram } from '../utils/clean';
import { Page, PageRequest, toPage } from '../utils/pagination';
import { cleanSearch } from '../utils/search';
import { Body } from '../utils/types';
import { cleanUploadedPhotos } from '../utils/uploads';
import { InvoiceService } from './invoice.service';
import { removeFilesNobodyUses } from './photo.service';
import { StockHold } from './stock-hold.service';
import { TelegramService } from './telegram.service';

const STATUSES = Object.values(BookingStatus);
const WARRANTIES = Object.values(Warranty);
const MAX_PHOTOS = 4;
const MAX_ITEM_NAME = 90;      // what fits on one line of the printed invoice
const STATUS_WORDS: Record<BookingStatus, string> = {
    [BookingStatus.PICKED_UP]: 'picked up',
    [BookingStatus.CANCELLED]: 'cancelled',
    [BookingStatus.BOOKED]: 'booked'
};

/** The numbers a screen shows beside a page of bookings. */
export interface BookingMeta { counts: BookingCounts }

/** What the address narrows the list to: ?status=booked&exclude_status=picked_up&search=dell (all optional, and checked). */
function filtersOf(query: Body): BookingFilters {
    const status = query.status === undefined ? '' : String(query.status);
    if (status && !STATUSES.includes(status as BookingStatus)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}`);
    const excludeStatus = query.exclude_status === undefined ? '' : String(query.exclude_status);
    if (excludeStatus && !STATUSES.includes(excludeStatus as BookingStatus)) throw badRequest(`exclude_status must be one of: ${STATUSES.join(', ')}`);
    return { status: status || undefined, excludeStatus: excludeStatus || undefined, search: cleanSearch(query.search) || undefined };
}

// ---------- cleaning each field (cleanMoney / cleanPhone / cleanTelegram / cleanDate come from utils/clean.ts) ----------

// Photos of a booking (e.g. the deposit receipt): only files uploaded through this app, at most 4, no repeats.
const cleanPhotos = (list: unknown) => cleanUploadedPhotos(list, 'booking', MAX_PHOTOS);

// Checks a COMPLETE booking and returns it in the shape the repository saves.
async function prepare(source: Body): Promise<Omit<BookingInput, 'stock_held'>> {
    let input = source;
    let productId: number | null = null;
    if (input.product_id !== null && input.product_id !== undefined && input.product_id !== '') {
        const id = Number(input.product_id);
        const product = Number.isInteger(id) && id > 0 ? await ProductRepository.findById(id) : null;
        if (!product) throw badRequest('That product no longer exists');
        productId = product.id;
        if (!String(input.product_name ?? '').trim()) input = { ...input, product_name: product.name };
    }

    const productName = String(input.product_name ?? '').trim().replace(/\s+/g, ' ');
    if (!productName) throw badRequest('Product is required');
    if (productName.length > 255) throw badRequest('Product is too long (max 255 characters)');

    const phone = cleanPhone(input.phone);
    const telegram = cleanTelegram(input.telegram);
    if (!phone && !telegram) throw badRequest('Add a phone number or a Telegram username so the customer can be reached');

    const fullPrice = cleanMoney(input.full_price, 'Full price');
    if (fullPrice <= 0) throw badRequest('Full price must be more than 0');
    const deposit = cleanMoney(input.deposit ?? 0, 'Deposit');
    if (deposit > fullPrice) throw badRequest('Deposit cannot be more than the full price');

    const bookingDate = cleanDate(input.booking_date, 'Booking date');
    const pickupDate = cleanDate(input.pickup_date, 'Pickup date');
    if (pickupDate < bookingDate) throw badRequest('Pickup date cannot be before the booking date');

    const status = String(input.status ?? BookingStatus.BOOKED) as BookingStatus;
    if (!STATUSES.includes(status)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}`);

    return {
        product_id: productId, product_name: productName, phone, telegram,
        full_price: fullPrice, deposit, booking_date: bookingDate, pickup_date: pickupDate, status,
        images: cleanPhotos(input.images)
    };
}

// The laptop of a picked-up booking is SOLD. Never throws: the Sale is already made, so a problem here is only reported (FAILED).
async function markLaptopSold(booking: BookingRecord): Promise<LaptopOutcome> {
    if (!booking.product_id) return LaptopOutcome.NONE;
    try {
        const product = await ProductRepository.findById(booking.product_id);
        if (!product) return LaptopOutcome.NONE;
        if (product.track_stock) {
            if (booking.stock_held) {
                await BookingRepository.clearStockHeld(booking.id);
                return LaptopOutcome.STOCK_KEPT;
            }
            await ProductRepository.update(product.id, { stock_quantity: Math.max(0, Number(product.stock_quantity) - 1) });
            return LaptopOutcome.STOCK_LOWERED;
        }
        await ProductRepository.markSold(product.id);          // archived, and no longer "set aside"
        await BookingRepository.clearStockHeld(booking.id);
        return LaptopOutcome.HIDDEN;
    } catch {
        return LaptopOutcome.FAILED;
    }
}

// ---------- the service ----------

export class BookingService {
    static async getAllBookings(query: Body = {}): Promise<BookingRecord[]> {
        return BookingRepository.findAll(filtersOf(query));
    }

    // One page of the same list. `meta.counts` are the numbers of the tabs: how many bookings are in each status.
    static async getBookingPage(query: Body, page: PageRequest): Promise<Page<BookingRecord, BookingMeta>> {
        const { rows, total } = await BookingRepository.findPage(filtersOf(query), page);
        return toPage(page, total, rows, { counts: await BookingRepository.statusCounts() });
    }

    static async getBookingById(id: string): Promise<BookingRecord> {
        const booking = await BookingRepository.findById(id);
        if (!booking) throw notFound('Booking');
        return booking;
    }

    // A booking of one of the shop's laptops takes it off the shelf (see StockHold): counted stock one less, a single laptop set aside.
    static async createBooking(data: Body): Promise<BookingRecord | undefined> {
        const clean = await prepare(data || {});
        const held = clean.product_id !== null && clean.status === BookingStatus.BOOKED ? await StockHold.holdForBooking(clean.product_id) : false;
        let id: number;
        try {
            id = await BookingRepository.create({ ...clean, stock_held: held });
        } catch (error) {
            if (held) await StockHold.release(clean.product_id);
            throw error;
        }
        return BookingRepository.findById(id);
    }

    // Send only what changed (e.g. { status: 'picked_up' }); the rest is kept, and the whole booking is checked again.
    static async updateBooking(id: string, data: Body): Promise<BookingRecord | undefined> {
        const current = await BookingRepository.findById(id);
        if (!current) throw notFound('Booking');

        const merged: Body = {
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
        const wasHeld = current.stock_held && current.status === BookingStatus.BOOKED;
        const sameProduct = clean.product_id === current.product_id;
        const willHold = clean.product_id !== null && clean.status === BookingStatus.BOOKED;
        let held = wasHeld && willHold && sameProduct;
        if (willHold && !held) held = await StockHold.holdForBooking(clean.product_id as number);
        if (wasHeld && !(willHold && sameProduct)) {
            if (clean.status === BookingStatus.PICKED_UP && sameProduct) await StockHold.sold(current.product_id as number);
            else await StockHold.release(current.product_id);
        }

        await BookingRepository.update(id, { ...clean, stock_held: held });
        await removeFilesNobodyUses(current.images.filter(url => !clean.images.includes(url)));
        return BookingRepository.findById(id);
    }

    // "The customer picked it up": ONE step that does everything or nothing.
    //   1. the booking becomes 'picked_up' (the first person to ask wins; a second one gets a 409),
    //   2. a SALE invoice is made, paid in full (the deposit already paid + the rest collected now),
    //   3. the booking remembers that Sale,
    //   4. the laptop is marked as sold (hidden from the Menu, or one less in stock).
    // When the Sale cannot be made the booking goes back to 'booked'. Body (all optional): customer_name, phone, telegram, warranty.
    static async pickUp(id: string, body: Body): Promise<{ booking: BookingRecord | undefined; invoice: InvoiceRecord | undefined; laptop: LaptopOutcome }> {
        const input = body || {};
        const booking = await BookingRepository.findById(id);
        if (!booking) throw notFound('Booking');
        if (booking.status !== BookingStatus.BOOKED) throw conflict(`This booking is already ${STATUS_WORDS[booking.status] || booking.status}`);

        // Everything typed is checked BEFORE anything changes.
        const warranty = String(input.warranty ?? Warranty.NONE) as Warranty;
        if (!WARRANTIES.includes(warranty)) throw badRequest('Warranty must be 1 week, 2 weeks, 1 month or none');
        const phone = input.phone === undefined ? booking.phone : cleanPhone(input.phone);
        const telegram = input.telegram === undefined ? booking.telegram : cleanTelegram(input.telegram);
        const customerName = String(input.customer_name ?? '').trim().replace(/\s+/g, ' ');
        if (customerName.length > 100) throw badRequest('Customer name is too long (max 100 characters)');

        if (!(await BookingRepository.claimPickup(id))) throw conflict('Someone just picked this booking up');

        let invoice: InvoiceRecord | undefined;
        try {
            invoice = await InvoiceService.createInvoice({
                type: InvoiceType.SALE,
                customer_name: customerName || null, phone, telegram,
                warranty,
                items: [{ name: booking.product_name.slice(0, MAX_ITEM_NAME).trim(), qty: 1, unit_price: booking.full_price }],
                deposit: booking.full_price
            });
        } catch (error) {
            await BookingRepository.releasePickup(id);
            throw error;
        }
        await BookingRepository.setSaleInvoice(id, (invoice as InvoiceRecord).id);

        const laptop = await markLaptopSold(booking);   // before reading the booking again: it may stop "holding" the laptop
        return { booking: await BookingRepository.findById(id), invoice, laptop };
    }

    static async deleteBooking(id: string): Promise<{ message: string }> {
        const current = await BookingRepository.findById(id);
        const deleted = await BookingRepository.delete(id);
        if (!deleted) throw notFound('Booking');
        // A booking that still held its laptop gives it back.
        if (current && current.stock_held && current.status === BookingStatus.BOOKED) await StockHold.release(current.product_id);
        await removeFilesNobodyUses(current ? current.images : []);
        return { message: 'Booking deleted successfully' };
    }

    // ---------- the Booking message in Telegram ----------

    // Keeps the ids of the Telegram messages just sent for this booking, so they can be taken down when the laptop is sold.
    // Never throws: the booking and the message are fine either way.
    static async rememberTelegramMessages(bookingId: number, chatId: string | number, messageIds: number[]): Promise<void> {
        try {
            await BookingRepository.addTelegramMessages(bookingId, chatId, messageIds);
        } catch (error) {
            console.warn(`Telegram: the booking message was sent but its ids were not kept (${(error as Error).message})`);
        }
    }

    // The laptop was SOLD (this Sale) and the Sold message is in its group: the Booking message is not needed any more, so it is
    // taken down. Answers how many Telegram messages went. Never throws: when it does not work the message just stays.
    static async takeDownBookingMessage(saleInvoiceId: number): Promise<number> {
        try {
            const booking = await BookingRepository.findBySaleInvoice(saleInvoiceId);
            if (!booking) return 0;                          // this Sale was not made from a booking
            const sent = await BookingRepository.getTelegramMessages(booking.id);
            if (sent.length === 0) return 0;                 // nothing was kept (it was sent before this was added, or never sent)
            const { removed } = await TelegramService.remove(TelegramGroup.BOOKING, sent);
            await BookingRepository.clearTelegramMessages(booking.id);
            return removed;
        } catch (error) {
            console.warn(`Telegram: the booking message was not taken down (${(error as Error).message})`);
            return 0;
        }
    }
}
