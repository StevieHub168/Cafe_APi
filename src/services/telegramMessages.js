// The words (and photos) of the messages the shop sends to its Telegram groups. Layouts follow the shop's own booking message.
// Text is sent as Telegram HTML, so everything typed by a person goes through esc().
const Booking = require('../models/Booking');
const Repair = require('../models/Repair');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const { photosOf } = require('../utils/uploads');

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// $1,050 / $1,299.50 (no .00 on a whole amount)
const money = (n) => {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};

// "2026-11-12" -> "12/11/2026"
const date = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : '';
};

const WARRANTY = { none: 'No warranty', '1_week': '1 week', '2_weeks': '2 weeks', '1_month': '1 month' };
const STATUS = { booked: 'Booked', picked_up: 'Picked up', cancelled: 'Cancelled' };
const padNumber = (n) => String(n ?? '').padStart(6, '0');

const nameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
const cover = (product) => (product ? photosOf(product)[0] || null : null);

const missing = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });

// ---------- Booking: "Booking Details" ----------

async function booking(id) {
    const b = await Booking.findById(id);
    if (!b) throw missing('Booking');
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
    const product = b.product_id ? await Product.findById(b.product_id) : null;
    return { group: 'booking', text: lines.join('\n'), photos: [cover(product) || b.product_image].filter(Boolean) };
}

// ---------- Repair: "REPAIR" ----------

async function repair(id) {
    const r = await Repair.findById(id);
    if (!r) throw missing('Repair');
    const customer = [r.customer_name, r.phone, r.telegram].filter(Boolean).join(' · ');
    const lines = [`<b>REPAIR</b>`, `• Laptop: ${esc(r.device)}`, `• Problem: ${esc(r.problem)}`];
    if (customer) lines.push(`• Customer: ${esc(customer)}`);
    lines.push(`• Received: ${date(r.received_date)}`);
    if (r.back_on) lines.push(`• Back on: ${date(r.back_on)}`);
    if (r.cost !== null && r.cost !== undefined) lines.push(`• Cost: ${money(r.cost)}`);
    if (r.sale_invoice_number) lines.push(`• Bought here: Sale ${padNumber(r.sale_invoice_number)}${r.sale_warranty && r.sale_warranty !== 'none' ? ` · warranty ${WARRANTY[r.sale_warranty]}` : ''}`);
    const product = r.product_id ? await Product.findById(r.product_id) : null;
    return { group: 'repair', text: lines.join('\n'), photos: [cover(product)].filter(Boolean) };
}

// ---------- Sold: "SOLD" (+ the invoice picture the app made) ----------

async function sold(id) {
    const invoice = await Invoice.findById(id);
    if (!invoice || invoice.type !== 'sale') throw missing('Sale');
    const customer = [invoice.customer_name, invoice.telegram, invoice.phone].filter(Boolean).join(' · ');
    const items = invoice.items.map(item => (item.qty > 1 ? `${esc(item.name)} × ${item.qty}` : esc(item.name)));
    const paid = Number(invoice.deposit) >= Number(invoice.total) ? 'Paid in full' : `Paid ${money(invoice.deposit)} · Balance ${money(invoice.total - invoice.deposit)}`;
    const lines = [`<b>SOLD</b>`, `• Laptop: ${items.join(', ')}`, `• Price: ${money(invoice.total)} · ${paid}`];
    if (customer) lines.push(`• Customer: ${esc(customer)}`);
    lines.push(`• Invoice: ${padNumber(invoice.number)} · Warranty: ${WARRANTY[invoice.warranty] || 'No warranty'}`, `• Date: ${date(invoice.invoice_date)}`);

    // The laptop photo: the booking it came from knows its laptop; otherwise the first line that is one of the products (sold ones included).
    let photo = null;
    const fromBooking = await Booking.findBySaleInvoice(invoice.id);
    if (fromBooking && fromBooking.product_id) photo = cover(await Product.findById(fromBooking.product_id));
    if (!photo) {
        const byName = new Map();
        for (const product of await Product.findAll({ includeArchived: true })) {
            const key = nameKey(product.name);
            if (key && !byName.has(key) && cover(product)) byName.set(key, cover(product));
        }
        for (const item of invoice.items) {
            const found = [nameKey(item.name), nameKey(String(item.name).split('|')[0])].map(key => byName.get(key)).find(Boolean);
            if (found) { photo = found; break; }
        }
    }
    return { group: 'sold', text: lines.join('\n'), photos: [photo].filter(Boolean) };
}

const BUILDERS = { booking, repair, sold };
const KINDS = Object.keys(BUILDERS);

module.exports = { build: (kind, id) => BUILDERS[kind](id), KINDS, esc, money, date, weekday };
