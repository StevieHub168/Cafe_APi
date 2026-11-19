import { QueryTypes, literal } from 'sequelize';
import { sequelize } from '../database/database';
import { BookingStatus } from '../enums/booking-status.enum';
import Booking from '../models/booking.model';
import { listOrNull, toBool, toBoolOrNull, toList, toNumberOrNull } from '../utils/json';
import { PageRequest } from '../utils/pagination';
import { MIN_PHONE_DIGITS, digitsOf, likePattern, phoneDigitsSql } from '../utils/search';

/** A booking as the app sees it. Dates are plain "YYYY-MM-DD" text (not JS Dates), so a time zone can never move a day. */
export interface BookingRecord {
    id: number;
    product_id: number | null;
    product_name: string;
    phone: string | null;
    telegram: string | null;
    full_price: number;
    deposit: number;
    booking_date: string;
    pickup_date: string;
    status: BookingStatus;
    images: string[];
    sale_invoice_id: number | null;
    /** Did this booking take a laptop off the shelf? */
    stock_held: boolean;
    created_at: Date;
    updated_at: Date;
    /** The photo of its laptop (also found for a laptop that was typed by name, not picked). */
    product_image: string | null;
    /** Is that laptop counted stock (true) or a single one (false)? null = no laptop of the shop. */
    product_track_stock: boolean | null;
    sale_invoice_number: number | null;
    /** The balance still to pay. */
    remaining_balance: number;
}

/** A complete, already-checked booking, ready to save. */
export interface BookingInput {
    product_id: number | null;
    product_name: string;
    phone: string | null;
    telegram: string | null;
    full_price: number;
    deposit: number;
    booking_date: string;
    pickup_date: string;
    status: BookingStatus;
    images: string[];
    stock_held: boolean;
}

// Kept as SQL on purpose: the dates come out as plain text, the photo of the laptop is looked up by name when the booking
// has no linked laptop, and the Sale number is joined in.
const SELECT = `
    SELECT b.id, b.product_id, b.product_name, b.phone, b.telegram,
           b.full_price, b.deposit,
           DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
           DATE_FORMAT(b.pickup_date,  '%Y-%m-%d') AS pickup_date,
           b.status, b.images, b.sale_invoice_id, b.stock_held, b.created_at, b.updated_at,
           COALESCE(p.image_url, (
               SELECT n.image_url FROM products n
               WHERE n.image_url IS NOT NULL AND n.image_url <> ''
                 AND n.name IN (TRIM(b.product_name), TRIM(SUBSTRING_INDEX(b.product_name, '|', 1)))
               ORDER BY n.id DESC LIMIT 1
           )) AS product_image, p.track_stock AS product_track_stock,
           s.number AS sale_invoice_number
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN invoices s ON s.id = b.sale_invoice_id AND s.type = 'sale'
`;

/** What narrows a list of bookings. Every filter is optional. */
export interface BookingFilters {
    status?: string;
    /** every status except this one (the Bookings page leaves out the picked-up ones: they became Sales) */
    excludeStatus?: string;
    /** looked for in the laptop, the telegram and the phone (also by its digits) */
    search?: string;
}

/** How many bookings are in each status (not narrowed by a search): the numbers of the tabs. */
export type BookingCounts = Record<BookingStatus, number>;

type RawBooking = Record<string, unknown>;

function whereOf(filters: BookingFilters): { sql: string; replacements: string[] } {
    const parts: string[] = [];
    const replacements: string[] = [];
    if (filters.status) { parts.push('b.status = ?'); replacements.push(filters.status); }
    if (filters.excludeStatus) { parts.push('b.status <> ?'); replacements.push(filters.excludeStatus); }
    if (filters.search) {
        const like = likePattern(filters.search);
        const digits = digitsOf(filters.search);
        const any = ['b.product_name LIKE ?', 'b.telegram LIKE ?', 'b.phone LIKE ?'];
        replacements.push(like, like, like);
        if (digits.length >= MIN_PHONE_DIGITS) { any.push(`${phoneDigitsSql('b.phone')} LIKE ?`); replacements.push(likePattern(digits)); }
        parts.push(`(${any.join(' OR ')})`);
    }
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', replacements };
}

// Booked ones first, the soonest pickup on top; finished / cancelled ones after them, newest first. (The id makes the order the same every time.)
const ORDER = `
    ORDER BY (b.status <> '${BookingStatus.BOOKED}'),
             CASE WHEN b.status = '${BookingStatus.BOOKED}' THEN b.pickup_date END ASC,
             b.pickup_date DESC, b.id DESC`;

// Money comes out of MySQL as text ("1050.00"): give back numbers, plus the balance still to pay.
function normalize(raw: RawBooking | undefined): BookingRecord | undefined {
    if (!raw) return undefined;
    const row = { ...raw };
    row.images = toList(row.images) ?? [];
    row.full_price = Number(row.full_price);
    row.deposit = Number(row.deposit);
    row.remaining_balance = Math.round(((row.full_price as number) - (row.deposit as number)) * 100) / 100;
    row.sale_invoice_number = toNumberOrNull(row.sale_invoice_number);
    row.stock_held = toBool(row.stock_held);
    row.product_track_stock = toBoolOrNull(row.product_track_stock);
    return row as unknown as BookingRecord;
}

const select = async (where: string, replacements: unknown[] = [], order = ''): Promise<RawBooking[]> =>
    sequelize.query<RawBooking>(`${SELECT} ${where} ${order}`, { replacements: replacements as string[], type: QueryTypes.SELECT });

export class BookingRepository {
    // True when any booking still uses this uploaded photo.
    static async usesPhoto(url: string): Promise<boolean> {
        const rows = await sequelize.query('SELECT id FROM bookings WHERE images LIKE ? LIMIT 1', { replacements: [`%${url}%`], type: QueryTypes.SELECT });
        return rows.length > 0;
    }

    static async findAll(filters: BookingFilters = {}): Promise<BookingRecord[]> {
        const where = whereOf(filters);
        const rows = await select(where.sql, where.replacements, ORDER);
        return rows.map(row => normalize(row) as BookingRecord);
    }

    /** One page of the same list, and how many bookings match in all. */
    static async findPage(filters: BookingFilters, page: PageRequest): Promise<{ rows: BookingRecord[]; total: number }> {
        const where = whereOf(filters);
        const [count] = await sequelize.query<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings b ${where.sql}`, { replacements: where.replacements, type: QueryTypes.SELECT });
        const rows = await select(where.sql, [...where.replacements, page.limit, page.offset] as string[], `${ORDER} LIMIT ? OFFSET ?`);
        return { rows: rows.map(row => normalize(row) as BookingRecord), total: Number(count.n) };
    }

    /** The numbers of the tabs: how many bookings are in each status. */
    static async statusCounts(): Promise<BookingCounts> {
        const rows = await sequelize.query<{ status: BookingStatus; n: number }>('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status', { type: QueryTypes.SELECT });
        const counts = Object.fromEntries(Object.values(BookingStatus).map(status => [status, 0])) as BookingCounts;
        for (const row of rows) counts[row.status] = Number(row.n);
        return counts;
    }

    static async findById(id: number | string): Promise<BookingRecord | undefined> {
        return normalize((await select('WHERE b.id = ?', [id]))[0]);
    }

    // The booking that became this Sale (the laptop it was about), or undefined.
    static async findBySaleInvoice(invoiceId: number): Promise<BookingRecord | undefined> {
        return normalize((await select('WHERE b.sale_invoice_id = ?', [invoiceId]))[0]);
    }

    static async create(data: BookingInput): Promise<number> {
        const booking = await Booking.create({
            product_id: data.product_id, product_name: data.product_name, phone: data.phone, telegram: data.telegram,
            full_price: data.full_price, deposit: data.deposit, booking_date: data.booking_date, pickup_date: data.pickup_date,
            status: data.status, images: listOrNull(data.images), stock_held: Boolean(data.stock_held)
        }, { validate: false });
        return booking.id;
    }

    // `data` is always the complete, already-checked booking (the service merges the changes first).
    // The link to the Sale is kept only while the booking is 'picked_up'.
    static async update(id: number | string, data: BookingInput): Promise<boolean> {
        const [affected] = await Booking.update({
            product_id: data.product_id, product_name: data.product_name, phone: data.phone, telegram: data.telegram,
            full_price: data.full_price, deposit: data.deposit, booking_date: data.booking_date, pickup_date: data.pickup_date,
            status: data.status, images: listOrNull(data.images),
            sale_invoice_id: data.status === BookingStatus.PICKED_UP ? literal('sale_invoice_id') : null,
            stock_held: Boolean(data.stock_held)
        } as never, { where: { id }, validate: false });
        return affected > 0;
    }

    // "The customer picked it up": the first person to ask wins. false = it was not 'booked' any more (someone was faster).
    static async claimPickup(id: number | string): Promise<boolean> {
        const [affected] = await Booking.update({ status: BookingStatus.PICKED_UP }, { where: { id, status: BookingStatus.BOOKED }, validate: false });
        return affected > 0;
    }

    // Undoes claimPickup when the Sale could not be made.
    static async releasePickup(id: number | string): Promise<void> {
        await Booking.update({ status: BookingStatus.BOOKED, sale_invoice_id: null }, { where: { id, status: BookingStatus.PICKED_UP, sale_invoice_id: null }, validate: false });
    }

    // The laptop of a picked-up booking is sold now: the booking no longer holds it.
    static async clearStockHeld(id: number | string): Promise<void> {
        await Booking.update({ stock_held: false }, { where: { id }, validate: false });
    }

    static async setSaleInvoice(id: number | string, invoiceId: number): Promise<void> {
        await Booking.update({ sale_invoice_id: invoiceId }, { where: { id }, validate: false });
    }

    // The Telegram messages sent for this booking, so they can be taken down when the laptop is sold:
    // [{ chat_id: "-100123", ids: [41, 42] }]  (a photo with several pictures is several messages). Not part of the booking the app sees.
    static async getTelegramMessages(id: number | string): Promise<{ chat_id: string; ids: number[] }[]> {
        const row = await Booking.findByPk(id, { attributes: ['telegram_messages'], raw: true });
        return toList<{ chat_id: string; ids: number[] }>(row?.telegram_messages) ?? [];
    }

    // Adds what was just sent (a second send keeps the first one: both get taken down).
    static async addTelegramMessages(id: number | string, chatId: string | number, messageIds: number[]): Promise<void> {
        if (!Array.isArray(messageIds) || messageIds.length === 0) return;
        const list = await BookingRepository.getTelegramMessages(id);
        list.push({ chat_id: String(chatId), ids: messageIds });
        await Booking.update({ telegram_messages: list }, { where: { id }, validate: false });
    }

    static async clearTelegramMessages(id: number | string): Promise<void> {
        await Booking.update({ telegram_messages: null }, { where: { id }, validate: false });
    }

    static async delete(id: number | string): Promise<boolean> {
        return (await Booking.destroy({ where: { id } })) > 0;
    }
}
