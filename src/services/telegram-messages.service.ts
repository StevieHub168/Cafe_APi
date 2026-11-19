// The words (and photos) of the messages the shop sends to its Telegram groups. Layouts follow the shop's own booking message.
// Text is sent as Telegram HTML, so everything typed by a person goes through esc().
import { BookingStatus } from '../enums/booking-status.enum';
import { InvoiceType } from '../enums/invoice-type.enum';
import { TelegramGroup } from '../enums/telegram-group.enum';
import { Warranty } from '../enums/warranty.enum';
import { notFound } from '../errors/app-error';
import { BookingRepository } from '../repositories/booking.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { ProductRecord, ProductRepository } from '../repositories/product.repository';
import { RepairRepository } from '../repositories/repair.repository';
import { photosOf } from '../utils/uploads';

/** A message ready to send: which group, the words, and the photos (laptop photo first). */
export interface TelegramMessage { group: TelegramGroup; text: string; photos: string[] }

export const esc = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// $1,050 / $1,299.50 (no .00 on a whole amount)
export const money = (n: unknown): string => {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};

// "2026-11-12" -> "12/11/2026"
export const date = (iso: unknown): string => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekday = (iso: unknown): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : '';
};

const WARRANTY: Record<string, string> = { [Warranty.NONE]: 'No warranty', [Warranty.ONE_WEEK]: '1 week', [Warranty.TWO_WEEKS]: '2 weeks', [Warranty.ONE_MONTH]: '1 month' };
const STATUS: Record<string, string> = { [BookingStatus.BOOKED]: 'Booked', [BookingStatus.PICKED_UP]: 'Picked up', [BookingStatus.CANCELLED]: 'Cancelled' };
const padNumber = (n: unknown): string => String(n ?? '').padStart(6, '0');

const nameKey = (name: unknown): string => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
const cover = (product: ProductRecord | null | undefined): string | null => (product ? photosOf(product)[0] || null : null);

// The photo of the product with this name (typed by hand, so it is not linked), also by the part before "|". null = none.
async function coverNamed(name: unknown): Promise<string | null> {
    const keys = [nameKey(name), nameKey(String(name || '').split('|')[0])].filter(Boolean);
    if (keys.length === 0) return null;
    const products = await ProductRepository.findAll({ includeArchived: true });
    for (const key of keys) {
        const found = products.find(product => nameKey(product.name) === key && cover(product));
        if (found) return cover(found);
    }
    return null;
}

// ---------- Booking: "Booking Details" ----------

async function booking(id: number): Promise<TelegramMessage> {
    const b = await BookingRepository.findById(id);
    if (!b) throw notFound('Booking');
    const lines = [`<b>Booking Details</b>`, `• Product: ${esc(b.product_name)}`];
    if (b.phone) lines.push(`• Phone: ${esc(b.phone)}`);
    if (b.telegram) lines.push(`• Telegram: ${esc(b.telegram)}`);
    const remaining = b.remaining_balance ?? Math.round((b.full_price - b.deposit) * 100) / 100;
    lines.push(
        `• Full Price: ${money(b.full_price)}`,
        `• Deposit: ${money(b.deposit)}`,
        `• Remaining Balance: ${money(remaining)}`,
        `• Booking Date: ${date(b.booking_date)}`,
        `• Pickup Date: ${date(b.pickup_date)} (${weekday(b.pickup_date)})`,
        `• Status: ${STATUS[b.status] || b.status}`
    );
    const product = b.product_id ? await ProductRepository.findById(b.product_id) : null;
    // The photo of its laptop first (product_image also finds a laptop that was typed by name, not picked), then the pictures added to the booking.
    // The text is the caption of the first picture (Telegram's own rule: when it is too long, it follows as its own message).
    const photos = [cover(product) || b.product_image, ...photosOf(b)].filter((photo): photo is string => Boolean(photo));
    return { group: TelegramGroup.BOOKING, text: lines.join('\n'), photos };
}

// ---------- Repair: "REPAIR" ----------

async function repair(id: number): Promise<TelegramMessage> {
    const r = await RepairRepository.findById(id);
    if (!r) throw notFound('Repair');
    const customer = [r.customer_name, r.phone, r.telegram].filter(Boolean).join(' · ');
    const lines = [`<b>REPAIR</b>`, `• Laptop: ${esc(r.device)}`, `• Problem: ${esc(r.problem)}`];
    if (customer) lines.push(`• Customer: ${esc(customer)}`);
    lines.push(`• Received: ${date(r.received_date)}`);
    if (r.back_on) lines.push(`• Back on: ${date(r.back_on)}`);
    if (r.cost !== null && r.cost !== undefined) lines.push(`• Cost: ${money(r.cost)}`);
    if (r.sale_invoice_number) lines.push(`• Bought here: Sale ${padNumber(r.sale_invoice_number)}${r.sale_warranty && r.sale_warranty !== Warranty.NONE ? ` · warranty ${WARRANTY[r.sale_warranty]}` : ''}`);
    const product = r.product_id ? await ProductRepository.findById(r.product_id) : null;
    const photos = [cover(product), ...photosOf(r)].filter((photo): photo is string => Boolean(photo));
    return { group: TelegramGroup.REPAIR, text: lines.join('\n'), photos };
}

// ---------- Sold: "SOLD" (+ the invoice picture the app made) ----------

async function sold(id: number): Promise<TelegramMessage> {
    const invoice = await InvoiceRepository.findById(id);
    if (!invoice || invoice.type !== InvoiceType.SALE) throw notFound('Sale');
    const customer = [invoice.customer_name, invoice.telegram, invoice.phone].filter(Boolean).join(' · ');
    const items = invoice.items.map(item => (item.qty > 1 ? `${esc(item.name)} × ${item.qty}` : esc(item.name)));
    const paid = Number(invoice.deposit) >= Number(invoice.total) ? 'Paid in full' : `Paid ${money(invoice.deposit)} · Balance ${money(invoice.total - invoice.deposit)}`;
    const lines = [`<b>SOLD</b>`, `• Laptop: ${items.join(', ')}`, `• Price: ${money(invoice.total)} · ${paid}`];
    if (customer) lines.push(`• Customer: ${esc(customer)}`);
    lines.push(`• Invoice: ${padNumber(invoice.number)} · Warranty: ${WARRANTY[invoice.warranty] || 'No warranty'}`, `• Date: ${date(invoice.invoice_date)}`);

    // The laptop photo: the booking it came from knows its laptop; otherwise the first line that is one of the products (sold ones included).
    let photo: string | null = null;
    const fromBooking = await BookingRepository.findBySaleInvoice(invoice.id);
    if (fromBooking && fromBooking.product_id) photo = cover(await ProductRepository.findById(fromBooking.product_id));
    for (const item of invoice.items) {
        if (photo) break;
        photo = await coverNamed(item.name);
    }
    return { group: TelegramGroup.SOLD, text: lines.join('\n'), photos: [photo].filter((p): p is string => Boolean(p)) };
}

const BUILDERS: Record<TelegramGroup, (id: number) => Promise<TelegramMessage>> = {
    [TelegramGroup.BOOKING]: booking,
    [TelegramGroup.REPAIR]: repair,
    [TelegramGroup.SOLD]: sold
};

/** The kinds of message that can be made, in the order the app lists them. */
export const KINDS: TelegramGroup[] = [TelegramGroup.BOOKING, TelegramGroup.REPAIR, TelegramGroup.SOLD];

export const buildTelegramMessage = (kind: TelegramGroup, id: number): Promise<TelegramMessage> => BUILDERS[kind](id);
