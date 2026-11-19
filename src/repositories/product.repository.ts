import { FindOptions, Op, QueryTypes, WhereOptions, col, literal } from 'sequelize';
import { sequelize } from '../database/database';
import { CODE_FROM_ID } from '../database/sql';
import { HoldStatus } from '../enums/hold-status.enum';
import { StockTaken } from '../enums/stock-taken.enum';
import Category from '../models/category.model';
import Product from '../models/product.model';
import { listOrNull, toList } from '../utils/json';
import { PageRequest } from '../utils/pagination';
import { likePattern } from '../utils/search';
import { photosOf } from '../utils/uploads';

export interface ExtraPrice { label: string; price: number }

/** A product as the app sees it. (Money and the 0 / 1 flags come out of MySQL as text / numbers, and are handed on as they are.) */
export interface ProductRecord {
    id: number;
    sku: string;
    code: string | null;
    name: string;
    category_id: number;
    category_name?: string | null;
    brand: string | null;
    model: string | null;
    description: string | null;
    selling_price: string;
    extra_prices: ExtraPrice[];
    track_stock: number;
    stock_quantity: number;
    min_stock_level: number;
    is_archived: number;
    hold_status: HoldStatus | null;
    image_url: string | null;
    images: string[];
    created_at: Date;
    updated_at: Date;
}

/** What is saved when a product is made (already checked by the service). */
export interface ProductInput {
    sku: string;
    name: string;
    category_id: number;
    brand?: string | null;
    model?: string | null;
    description?: string | null;
    selling_price?: number;
    extra_prices?: ExtraPrice[];
    track_stock?: number | boolean;
    stock_quantity?: number;
    min_stock_level?: number;
    image_url?: string | null;
    images?: string[];
}

/** What narrows a list of products. Every filter is optional. */
export interface ProductFilters {
    /** the Menu leaves out what is sold, set aside for a booking or in repair; the Products page asks for everything */
    includeArchived?: boolean;
    categoryId?: number;
    brand?: string;
    /** looked for in the name, the SKU, the code and the brand */
    search?: string;
}

function whereOf(filters: ProductFilters): WhereOptions {
    const all: WhereOptions[] = [];
    if (!filters.includeArchived) all.push({ is_archived: false, hold_status: null });
    if (filters.categoryId !== undefined) all.push({ category_id: filters.categoryId });
    if (filters.brand) all.push({ brand: filters.brand });
    if (filters.search) {
        const like = { [Op.like]: likePattern(filters.search) };
        all.push({ [Op.or]: [{ name: like }, { sku: like }, { code: like }, { brand: like }] });
    }
    return { [Op.and]: all };
}

// By category, then by name; the id makes the order the same every time (two laptops can have the same name).
const ORDER: FindOptions['order'] = [[{ model: Category, as: 'category' }, 'name', 'ASC'], ['name', 'ASC'], ['id', 'ASC']];

type ProductChanges = Partial<ProductInput> & { is_archived?: number | boolean };

// Every read also says the name of the category.
const WITH_CATEGORY: Pick<FindOptions, 'include' | 'raw'> = { include: [{ model: Category, attributes: ['name'], required: false }], raw: true };

type RawProduct = Record<string, unknown> & { 'category.name'?: string | null };

// Two JSON columns are handed back as clean lists so callers never deal with null/strings:
//   extra_prices: [{ "label": "16GB / 512GB", "price": 799 }, ...]
//   images:       ["https://...", "/uploads/....png", ...]   (the first one is the cover = image_url)
function normalize(raw: RawProduct | null | undefined, withCategory: boolean): ProductRecord | undefined {
    if (!raw) return undefined;
    const { 'category.name': categoryName, ...row } = raw;
    if (withCategory) row.category_name = categoryName ?? null;
    row.extra_prices = toList<ExtraPrice>(row.extra_prices) ?? [];
    row.images = photosOf(row);
    return row as unknown as ProductRecord;
}

const many = (rows: unknown[]): ProductRecord[] => rows.map(row => normalize(row as RawProduct, true) as ProductRecord);

// The columns a product update may change.
const UPDATABLE = ['sku', 'name', 'category_id', 'brand', 'model', 'description', 'selling_price', 'extra_prices', 'track_stock',
    'stock_quantity', 'min_stock_level', 'is_archived', 'image_url', 'images'] as const;

export class ProductRepository {
    // "lp-42" / "LP-0042" -> the product, or undefined.
    static async findByCode(code: unknown): Promise<ProductRecord | undefined> {
        const clean = String(code || '').trim().toUpperCase();
        if (!/^LP-\d{1,9}$/.test(clean)) return undefined;
        return normalize((await Product.findOne({ where: { code: clean }, ...WITH_CATEGORY })) as unknown as RawProduct, true);
    }

    // The Menu list (no includeArchived) shows what can be sold: not sold, not set aside for a booking, not in repair.
    static async findAll(filters: ProductFilters = {}): Promise<ProductRecord[]> {
        return many(await Product.findAll({ where: whereOf(filters), order: ORDER, ...WITH_CATEGORY }));
    }

    /** One page of the same list, and how many products match in all. */
    static async findPage(filters: ProductFilters, page: PageRequest): Promise<{ rows: ProductRecord[]; total: number }> {
        const where = whereOf(filters);
        const total = await Product.count({ where });
        const rows = await Product.findAll({ where, order: ORDER, limit: page.limit, offset: page.offset, ...WITH_CATEGORY });
        return { rows: many(rows), total };
    }

    static async findById(id: number | string): Promise<ProductRecord | undefined> {
        return normalize((await Product.findOne({ where: { id }, ...WITH_CATEGORY })) as unknown as RawProduct, true);
    }

    static async findBySku(sku: string): Promise<ProductRecord | undefined> {
        return normalize((await Product.findOne({ where: { sku }, raw: true })) as unknown as RawProduct, false);
    }

    // True when any product still uses this photo address (as its cover or in its photo list).
    static async usesPhoto(url: string): Promise<boolean> {
        const rows = await sequelize.query('SELECT id FROM products WHERE image_url = ? OR images LIKE ? LIMIT 1', { replacements: [url, `%${url}%`], type: QueryTypes.SELECT });
        return rows.length > 0;
    }

    // All SKUs that start with the prefix (used to pick the next number). The prefix only ever holds A-Z, 0-9 and "-".
    static async findSkusWithPrefix(prefix: string): Promise<string[]> {
        const rows = await Product.findAll({ attributes: ['sku'], where: { sku: { [Op.like]: `${prefix}%` } }, raw: true });
        return rows.map(row => row.sku);
    }

    static async create(data: ProductInput): Promise<number> {
        const product = await Product.create({
            sku: data.sku,
            name: data.name,
            category_id: data.category_id,
            brand: data.brand || null,
            model: data.model || null,
            description: data.description || null,
            selling_price: data.selling_price || 0,
            extra_prices: listOrNull(data.extra_prices),
            track_stock: Boolean(data.track_stock),
            stock_quantity: data.stock_quantity ?? 0,
            min_stock_level: data.min_stock_level || 0,
            image_url: data.image_url || null,
            images: listOrNull(data.images)
        }, { validate: false });
        await sequelize.query(`UPDATE products SET code = ${CODE_FROM_ID} WHERE id = ?`, { replacements: [product.id] });
        return product.id;
    }

    static async update(id: number | string, data: ProductChanges): Promise<number> {
        const changes: Record<string, unknown> = {};
        for (const key of UPDATABLE) {
            if (data[key] === undefined) continue;
            changes[key] = key === 'extra_prices' || key === 'images' ? listOrNull(data[key] as unknown[]) : data[key];
        }
        if (Object.keys(changes).length === 0) return 0;
        const [affected] = await Product.update(changes, { where: { id }, validate: false });
        return affected;
    }

    static async delete(id: number | string): Promise<number> {
        return Product.destroy({ where: { id } });
    }

    // ---- taking one laptop off the shelf for a booking / a repair, and putting it back ----
    // Each is ONE statement, so two people acting at the same moment can never take the same single laptop.

    // Counted stock: one less (never below 0) -> STOCK. A single laptop: set aside as 'booked' / 'repair', only when it is
    // free -> SINGLE. null = nothing was taken (no such product, sold, already set aside, or counted stock with none left).
    static async takeOne(id: number, why: HoldStatus): Promise<StockTaken | null> {
        const [counted] = await Product.update(
            { stock_quantity: literal('stock_quantity - 1') },
            { where: { id, is_archived: false, track_stock: true, stock_quantity: { [Op.gt]: 0 } }, validate: false }
        );
        if (counted) return StockTaken.STOCK;
        const [single] = await Product.update(
            { hold_status: why },
            { where: { id, is_archived: false, track_stock: false, hold_status: null }, validate: false }
        );
        return single ? StockTaken.SINGLE : null;
    }

    // The other way: counted stock one more -> STOCK; a single laptop is free again -> SINGLE; null = nothing to give back.
    static async putBackOne(id: number | null | undefined): Promise<StockTaken | null> {
        if (id === null || id === undefined) return null;
        const [counted] = await Product.update(
            { stock_quantity: literal('stock_quantity + 1') },
            { where: { id, track_stock: true }, validate: false }
        );
        if (counted) return StockTaken.STOCK;
        const [single] = await Product.update(
            { hold_status: null },
            { where: { id, track_stock: false, hold_status: { [Op.ne]: null } }, validate: false }
        );
        return single ? StockTaken.SINGLE : null;
    }

    // A single laptop is sold: archived (hidden from the Menu) and no longer "set aside". true = it was a single laptop.
    static async markSold(id: number): Promise<boolean> {
        const [affected] = await Product.update({ is_archived: true, hold_status: null }, { where: { id, track_stock: false }, validate: false });
        return affected > 0;
    }

    static async getLowStock(): Promise<ProductRecord[]> {
        const rows = await Product.findAll({
            where: { is_archived: false, track_stock: true, stock_quantity: { [Op.lte]: col('Product.min_stock_level') } },
            order: [['stock_quantity', 'ASC']],
            ...WITH_CATEGORY
        });
        return many(rows);
    }
}
