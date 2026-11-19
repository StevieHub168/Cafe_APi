import { Op, QueryTypes, WhereOptions, literal } from 'sequelize';
import { sequelize } from '../database/database';
import { InvoiceType } from '../enums/invoice-type.enum';
import { Warranty } from '../enums/warranty.enum';
import Booking from '../models/booking.model';
import Invoice, { InvoiceItem } from '../models/invoice.model';
import Repair from '../models/repair.model';
import { toList } from '../utils/json';
import { PageRequest } from '../utils/pagination';
import { MIN_PHONE_DIGITS, digitsOf, likePattern, phoneDigitsSql } from '../utils/search';

/** An invoice as the app sees it. Dates are plain "YYYY-MM-DD" text (not JS Dates), so a time zone can never move a day. */
export interface InvoiceRecord {
    id: number;
    number: number;
    type: InvoiceType;
    invoice_date: string;
    customer_name: string | null;
    phone: string | null;
    telegram: string | null;
    device: string | null;
    problem: string | null;
    pickup_date: string | null;
    booking_id: number | null;
    repair_id: number | null;
    warranty: Warranty;
    items: InvoiceItem[];
    total: number;
    deposit: number;
    created_at: Date;
    updated_at: Date;
    /** The balance still to pay. */
    balance: number;
    /** The number as printed ("000041"). */
    number_text: string;
}

/** A complete, already-checked invoice, ready to save. */
export interface InvoiceInput {
    number: number;
    type: InvoiceType;
    invoice_date: string;
    customer_name: string | null;
    phone: string | null;
    telegram: string | null;
    device: string | null;
    problem: string | null;
    pickup_date: string | null;
    booking_id: number | null;
    repair_id: number | null;
    warranty: Warranty;
    items: InvoiceItem[];
    total: number;
    deposit: number;
}

/** What narrows a list of invoices. Every filter is optional. */
export interface InvoiceFilters {
    /** sale, booking or repair */
    type?: string;
    /** 'month' = made this month, 'warranty' = still under warranty today */
    period?: string;
    /** looked for in the number, the customer, the contact and the items */
    search?: string;
}

/** The numbers on top of the Sales page: how many invoices, made this month, still under warranty (not narrowed by a search). */
export interface InvoiceCounts { all: number; month: number; warranty: number }

// The same rules as the app: "this month" is the month of today; a warranty ends 7 days / 14 days / 1 month (same day next month, never
// spilling into the month after) after the invoice date, and its last day still counts.
const THIS_MONTH = "DATE_FORMAT(invoice_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')";
const WARRANTY_END = `CASE warranty
    WHEN '1_week' THEN DATE_ADD(invoice_date, INTERVAL 7 DAY)
    WHEN '2_weeks' THEN DATE_ADD(invoice_date, INTERVAL 14 DAY)
    WHEN '1_month' THEN DATE_ADD(invoice_date, INTERVAL 1 MONTH)
END`;
const UNDER_WARRANTY = `${WARRANTY_END} >= CURDATE()`;

// A search finds an invoice by its number ("44" or "000044"), the customer, the telegram, the phone (also by its digits) or the name of an item.
function searchWhere(text: string): WhereOptions {
    const like = sequelize.escape(likePattern(text));
    const digits = digitsOf(text);
    const any: WhereOptions[] = [
        { customer_name: { [Op.like]: likePattern(text) } },
        { telegram: { [Op.like]: likePattern(text) } },
        { phone: { [Op.like]: likePattern(text) } },
        literal(`LOWER(JSON_UNQUOTE(JSON_EXTRACT(items, '$[*].name'))) LIKE LOWER(${like})`)
    ];
    if (/^\d+$/.test(text)) any.push(literal(`LPAD(number, 6, '0') LIKE ${like}`));
    if (digits.length >= MIN_PHONE_DIGITS) any.push(literal(`${phoneDigitsSql('phone')} LIKE ${sequelize.escape(likePattern(digits))}`));
    return { [Op.or]: any };
}

function whereOf(filters: InvoiceFilters): WhereOptions {
    const all: WhereOptions[] = [];
    if (filters.type) all.push({ type: filters.type });
    if (filters.period === 'month') all.push(literal(`(${THIS_MONTH})`));
    if (filters.period === 'warranty') all.push(literal(`(${UNDER_WARRANTY})`));
    if (filters.search) all.push(searchWhere(filters.search));
    return { [Op.and]: all };
}

const ATTRIBUTES = ['id', 'number', 'type', 'invoice_date', 'customer_name', 'phone', 'telegram', 'device', 'problem', 'pickup_date',
    'booking_id', 'repair_id', 'warranty', 'items', 'total', 'deposit', 'created_at', 'updated_at'];

type RawInvoice = Record<string, unknown>;

// JSON items come back as a clean list, money as numbers, plus the balance still to pay and the number as printed ("000041").
function normalize(raw: RawInvoice | null | undefined): InvoiceRecord | undefined {
    if (!raw) return undefined;
    const row = { ...raw };
    row.items = toList(row.items) ?? [];
    row.total = Number(row.total);
    row.deposit = Number(row.deposit);
    row.balance = Math.round(((row.total as number) - (row.deposit as number)) * 100) / 100;
    row.number_text = String(row.number).padStart(6, '0');
    return row as unknown as InvoiceRecord;
}

export class InvoiceRepository {
    // The highest number used so far (null when there is no invoice yet).
    static async highestNumber(): Promise<number | null> {
        const [row] = await sequelize.query<{ highest: number | null }>('SELECT MAX(number) AS highest FROM invoices', { type: QueryTypes.SELECT });
        return row.highest === null ? null : Number(row.highest);
    }

    // Newest number first.
    static async findAll(filters: InvoiceFilters = {}): Promise<InvoiceRecord[]> {
        const rows = await Invoice.findAll({ attributes: ATTRIBUTES, where: whereOf(filters), order: [['number', 'DESC']], raw: true });
        return rows.map(row => normalize(row as unknown as RawInvoice) as InvoiceRecord);
    }

    /** One page of the same list (the number is unique, so the pages never overlap), and how many invoices match in all. */
    static async findPage(filters: InvoiceFilters, page: PageRequest): Promise<{ rows: InvoiceRecord[]; total: number }> {
        const where = whereOf(filters);
        const total = await Invoice.count({ where });
        const rows = await Invoice.findAll({ attributes: ATTRIBUTES, where, order: [['number', 'DESC']], limit: page.limit, offset: page.offset, raw: true });
        return { rows: rows.map(row => normalize(row as unknown as RawInvoice) as InvoiceRecord), total };
    }

    /** The numbers of the tabs of one kind of invoice (or of all). Not narrowed by a search or a period. */
    static async counts(type?: string): Promise<InvoiceCounts> {
        const [row] = await sequelize.query<{ total: number; month: string | null; warranty: string | null }>(
            `SELECT COUNT(*) AS total,
                    SUM(${THIS_MONTH}) AS month,
                    SUM(COALESCE(${UNDER_WARRANTY}, 0)) AS warranty
             FROM invoices ${type ? 'WHERE type = ?' : ''}`,
            { replacements: type ? [type] : [], type: QueryTypes.SELECT }
        );
        return { all: Number(row.total), month: Number(row.month ?? 0), warranty: Number(row.warranty ?? 0) };
    }

    static async findById(id: number | string): Promise<InvoiceRecord | undefined> {
        return normalize((await Invoice.findOne({ attributes: ATTRIBUTES, where: { id }, raw: true })) as unknown as RawInvoice | null);
    }

    static async create(data: InvoiceInput): Promise<number> {
        const invoice = await Invoice.create({ ...data }, { validate: false });
        return invoice.id;
    }

    // `data` is always the complete, already-checked invoice (the service merges the changes first). The type never changes.
    static async update(id: number | string, data: InvoiceInput): Promise<boolean> {
        const { type: _type, ...changes } = data;
        const [affected] = await Invoice.update(changes, { where: { id }, validate: false });
        return affected > 0;
    }

    // A booking or a repair that pointed at this Sale stops pointing at it (the link has no foreign key).
    static async delete(id: number | string): Promise<boolean> {
        return sequelize.transaction(async (transaction) => {
            await Booking.update({ sale_invoice_id: null }, { where: { sale_invoice_id: id }, transaction, validate: false });
            await Repair.update({ sale_invoice_id: null }, { where: { sale_invoice_id: id }, transaction, validate: false });
            return (await Invoice.destroy({ where: { id }, transaction })) > 0;
        });
    }
}
