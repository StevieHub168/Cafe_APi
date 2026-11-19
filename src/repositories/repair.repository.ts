import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/database';
import { RepairStatus } from '../enums/repair-status.enum';
import { Warranty } from '../enums/warranty.enum';
import Repair from '../models/repair.model';
import { toBool, toBoolOrNull, toList, toNumberOrNull } from '../utils/json';
import { PageRequest } from '../utils/pagination';
import { MIN_PHONE_DIGITS, digitsOf, likePattern, phoneDigitsSql } from '../utils/search';

/** A repair job as the app sees it. Dates are plain "YYYY-MM-DD" text (not JS Dates), so a time zone can never move a day. */
export interface RepairRecord {
    id: number;
    product_id: number | null;
    device: string;
    customer_name: string | null;
    phone: string | null;
    telegram: string | null;
    problem: string;
    received_date: string;
    back_on: string | null;
    /** null = not set yet */
    cost: number | null;
    status: RepairStatus;
    fixed_date: string | null;
    picked_up_date: string | null;
    sale_invoice_id: number | null;
    sale_invoice_number: number | null;
    sale_date: string | null;
    sale_warranty: Warranty | null;
    /** Did this repair take one of the shop's laptops off the shelf (while it is 'received')? */
    stock_held: boolean;
    /** Is that laptop counted stock (true) or a single one (false)? null = no laptop of the shop. */
    product_track_stock: boolean | null;
    /** The photos of what is wrong: a list of "/uploads/x.png". */
    images: string[];
    created_at: Date;
    updated_at: Date;
}

/** A complete, already-checked repair, ready to save. */
export interface RepairInput {
    product_id: number | null;
    device: string;
    customer_name: string | null;
    phone: string | null;
    telegram: string | null;
    problem: string;
    received_date: string;
    back_on: string | null;
    cost: number | null;
    status: RepairStatus;
    fixed_date: string | null;
    picked_up_date: string | null;
    sale_invoice_id: number | null;
    stock_held: boolean;
    images: string[];
}

// Kept as SQL on purpose: the dates come out as plain text and the Sale and the laptop are joined in.
const SELECT = `
    SELECT r.id, r.product_id, r.device, r.customer_name, r.phone, r.telegram, r.problem,
           DATE_FORMAT(r.received_date,  '%Y-%m-%d') AS received_date,
           DATE_FORMAT(r.back_on,        '%Y-%m-%d') AS back_on,
           r.cost, r.status,
           DATE_FORMAT(r.fixed_date,     '%Y-%m-%d') AS fixed_date,
           DATE_FORMAT(r.picked_up_date, '%Y-%m-%d') AS picked_up_date,
           r.sale_invoice_id,
           s.number AS sale_invoice_number,
           DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS sale_date,
           s.warranty AS sale_warranty,
           r.stock_held, p.track_stock AS product_track_stock,
           r.images, r.created_at, r.updated_at
    FROM repairs r
    LEFT JOIN invoices s ON s.id = r.sale_invoice_id AND s.type = 'sale'
    LEFT JOIN products p ON p.id = r.product_id
`;

/** What narrows a list of repairs. Every filter is optional. */
export interface RepairFilters {
    status?: string;
    /** looked for in the laptop, the problem, the customer, the telegram and the phone (also by its digits) */
    search?: string;
}

/** How many repairs are in each step (not narrowed by a search): the numbers of the tabs. */
export type RepairCounts = Record<RepairStatus, number>;

type RawRepair = Record<string, unknown>;

function whereOf(filters: RepairFilters): { sql: string; replacements: string[] } {
    const parts: string[] = [];
    const replacements: string[] = [];
    if (filters.status) { parts.push('r.status = ?'); replacements.push(filters.status); }
    if (filters.search) {
        const like = likePattern(filters.search);
        const digits = digitsOf(filters.search);
        const any = ['r.device LIKE ?', 'r.problem LIKE ?', 'r.customer_name LIKE ?', 'r.telegram LIKE ?', 'r.phone LIKE ?'];
        replacements.push(like, like, like, like, like);
        if (digits.length >= MIN_PHONE_DIGITS) { any.push(`${phoneDigitsSql('r.phone')} LIKE ?`); replacements.push(likePattern(digits)); }
        parts.push(`(${any.join(' OR ')})`);
    }
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', replacements };
}

// What is still in the shop first (the one waiting longest on top); picked-up ones after them, newest first. (The id makes the order the same every time.)
const ORDER = `
    ORDER BY (r.status = '${RepairStatus.PICKED_UP}'),
             CASE WHEN r.status <> '${RepairStatus.PICKED_UP}' THEN r.received_date END ASC,
             r.picked_up_date DESC, r.id DESC`;

// Money comes out of MySQL as text ("60.00"): give back numbers (the cost may be empty = not set yet).
function normalize(raw: RawRepair | undefined): RepairRecord | undefined {
    if (!raw) return undefined;
    const row = { ...raw };
    row.cost = toNumberOrNull(row.cost);
    row.sale_invoice_number = toNumberOrNull(row.sale_invoice_number);
    row.stock_held = toBool(row.stock_held);
    row.product_track_stock = toBoolOrNull(row.product_track_stock);
    row.images = toList(row.images) ?? [];
    return row as unknown as RepairRecord;
}

const select = async (where: string, replacements: unknown[] = [], order = ''): Promise<RawRepair[]> =>
    sequelize.query<RawRepair>(`${SELECT} ${where} ${order}`, { replacements: replacements as string[], type: QueryTypes.SELECT });

export class RepairRepository {
    // True when any repair still uses this uploaded photo.
    static async usesPhoto(url: string): Promise<boolean> {
        const rows = await sequelize.query('SELECT id FROM repairs WHERE images LIKE ? LIMIT 1', { replacements: [`%${url}%`], type: QueryTypes.SELECT });
        return rows.length > 0;
    }

    static async findAll(filters: RepairFilters = {}): Promise<RepairRecord[]> {
        const where = whereOf(filters);
        const rows = await select(where.sql, where.replacements, ORDER);
        return rows.map(row => normalize(row) as RepairRecord);
    }

    /** One page of the same list, and how many repairs match in all. */
    static async findPage(filters: RepairFilters, page: PageRequest): Promise<{ rows: RepairRecord[]; total: number }> {
        const where = whereOf(filters);
        const [count] = await sequelize.query<{ n: number }>(`SELECT COUNT(*) AS n FROM repairs r ${where.sql}`, { replacements: where.replacements, type: QueryTypes.SELECT });
        const rows = await select(where.sql, [...where.replacements, page.limit, page.offset] as string[], `${ORDER} LIMIT ? OFFSET ?`);
        return { rows: rows.map(row => normalize(row) as RepairRecord), total: Number(count.n) };
    }

    /** The numbers of the tabs: how many repairs are in each step. */
    static async statusCounts(): Promise<RepairCounts> {
        const rows = await sequelize.query<{ status: RepairStatus; n: number }>('SELECT status, COUNT(*) AS n FROM repairs GROUP BY status', { type: QueryTypes.SELECT });
        const counts = Object.fromEntries(Object.values(RepairStatus).map(status => [status, 0])) as RepairCounts;
        for (const row of rows) counts[row.status] = Number(row.n);
        return counts;
    }

    static async findById(id: number | string): Promise<RepairRecord | undefined> {
        return normalize((await select('WHERE r.id = ?', [id]))[0]);
    }

    static async create(data: RepairInput): Promise<number> {
        const repair = await Repair.create({ ...RepairRepository.columns(data) }, { validate: false });
        return repair.id;
    }

    // `data` is always the complete, already-checked repair (the service merges the changes first).
    static async update(id: number | string, data: RepairInput): Promise<boolean> {
        const [affected] = await Repair.update(RepairRepository.columns(data), { where: { id }, validate: false });
        return affected > 0;
    }

    static async delete(id: number | string): Promise<boolean> {
        return (await Repair.destroy({ where: { id } })) > 0;
    }

    // What is written to the table (no photo at all is saved as an empty list).
    private static columns(data: RepairInput) {
        return {
            product_id: data.product_id, device: data.device, customer_name: data.customer_name, phone: data.phone, telegram: data.telegram,
            problem: data.problem, received_date: data.received_date, back_on: data.back_on, cost: data.cost, status: data.status,
            fixed_date: data.fixed_date, picked_up_date: data.picked_up_date, sale_invoice_id: data.sale_invoice_id,
            stock_held: Boolean(data.stock_held), images: data.images ?? []
        };
    }
}
