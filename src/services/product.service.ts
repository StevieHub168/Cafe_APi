import { isDuplicateEntry } from '../database/db-errors';
import { AppError, badRequest, conflict, notFound } from '../errors/app-error';
import { CategoryRecord, CategoryRepository } from '../repositories/category.repository';
import { ExtraPrice, ProductFilters, ProductRecord, ProductRepository } from '../repositories/product.repository';
import { cleanMoney } from '../utils/clean';
import { Page, PageRequest, toPage } from '../utils/pagination';
import { cleanSearch } from '../utils/search';
import { Body } from '../utils/types';
import { photosOf, removeImage } from '../utils/uploads';

// Brand rules come from the category's `brands` list (a JSON array in the categories table):
//   - several brands (e.g. Windows) -> brand is required and must be one of them
//   - exactly one brand (e.g. Mac)  -> that brand is filled in automatically
//   - no list                       -> brand is free text and optional
function resolveBrand(category: CategoryRecord, brand: unknown): string | null {
    const options = category.brands || [];
    const value = String(brand ?? '').trim();

    if (options.length === 0) return value || null;
    if (options.length === 1) return options[0];

    if (!value) {
        throw badRequest(`Brand is required for ${category.name}. Choose one of: ${options.join(', ')}`);
    }
    const match = options.find(o => o.toLowerCase() === value.toLowerCase());
    if (!match) {
        throw badRequest(`Brand "${value}" is not allowed for ${category.name}. Choose one of: ${options.join(', ')}`);
    }
    return match;
}

// ---------- prices & description ----------

// extra_prices: [{ label, price }] - extra price options such as "16GB / 512GB" or "Installment".
// Fully empty rows are ignored; a half-filled row is an error.
function cleanExtraPrices(list: unknown): ExtraPrice[] {
    if (list === null || list === '') return [];
    if (!Array.isArray(list)) throw badRequest('Extra prices must be a list');

    const rows = list.filter(r => r && (String(r.label ?? '').trim() !== '' || (r.price !== '' && r.price !== null && r.price !== undefined)));
    if (rows.length > 10) throw badRequest('A product can have at most 10 extra prices');

    return rows.map((r, i) => {
        const label = String(r.label ?? '').trim();
        if (!label) throw badRequest(`Extra price ${i + 1}: please add a label (e.g. "16GB / 512GB")`);
        if (label.length > 50) throw badRequest(`Extra price ${i + 1}: the label is too long (max 50 characters)`);
        return { label, price: cleanMoney(r.price, `Extra price ${i + 1}`) };
    });
}

function cleanDescription(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\r\n/g, '\n').trim();
    if (text.length > 2000) throw badRequest('Description is too long (max 2000 characters)');
    return text || null;
}

// ---------- stock ----------
// track_stock OFF = the product is a single item: stock is always 1 and there is no low-stock level.
// track_stock ON  = stock and min stock are whatever you enter (whole numbers, 0 or more).

function cleanCount(value: unknown, what: string): number {
    const n = Number(value);
    if (value === '' || value === null || !Number.isInteger(n) || n < 0) {
        throw badRequest(`${what} must be a whole number of 0 or more`);
    }
    return n;
}

/** `current` is the saved product when updating, or undefined when creating. */
function normalizeStock(data: Body, current?: ProductRecord): Body {
    const out: Body = { ...data };
    const tracked = data.track_stock !== undefined ? Boolean(data.track_stock) : Boolean(current?.track_stock);

    if (data.track_stock !== undefined) out.track_stock = tracked ? 1 : 0;

    if (!tracked) {
        // Single item. On create, or whenever stock is touched, pin it to 1.
        if (!current || data.track_stock !== undefined || data.stock_quantity !== undefined || data.min_stock_level !== undefined) {
            out.stock_quantity = 1;
            out.min_stock_level = 0;
        }
        return out;
    }

    if (data.stock_quantity !== undefined) out.stock_quantity = cleanCount(data.stock_quantity, 'Stock');
    if (data.min_stock_level !== undefined) out.min_stock_level = cleanCount(data.min_stock_level, 'Min stock');
    return out;
}

// ---------- photo ----------
// A product has a LIST of photos (`images`, up to 8). The first one is the cover and is also kept in `image_url`.
// Each photo is either a file we uploaded ("/uploads/<name>") or a web link (http:// or https://). Nothing else.

const MAX_PHOTOS = 8;

/** Returns the cleaned photo address, or null when it is empty. Throws when it is not allowed. */
function cleanPhoto(value: unknown): string | null {
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (!text) return null;
    if (text.length > 500) {
        throw badRequest('A photo link is too long (max 500 characters). Upload the picture as a file instead.');
    }
    if (!text.startsWith('/uploads/') && !/^https?:\/\/\S+$/i.test(text)) {
        throw badRequest('A photo must be an uploaded file or a link that starts with http:// or https://');
    }
    return text;
}

/**
 * Keeps `images` (the list) and `image_url` (the cover = first photo) in step:
 *   images given   -> cleaned, no repeats, at most 8; image_url becomes the first one
 *   only image_url -> older callers: the list becomes just that one photo
 */
function normalizePhotos(data: Body): Body {
    if (data.images !== undefined) {
        const list = data.images === null ? [] : data.images;
        if (!Array.isArray(list)) throw badRequest('Photos must be a list');
        const photos: string[] = [];
        for (const item of list) {
            const photo = cleanPhoto(item);
            if (photo && !photos.includes(photo)) photos.push(photo);
        }
        if (photos.length > MAX_PHOTOS) throw badRequest(`A product can have at most ${MAX_PHOTOS} photos`);
        return { ...data, images: photos, image_url: photos[0] ?? null };
    }
    if (data.image_url !== undefined) {
        const photo = cleanPhoto(data.image_url);
        return { ...data, images: photo ? [photo] : [], image_url: photo };
    }
    return data;
}

// ---------- automatic SKU ----------
// Mac product              -> MAC-007
// Windows product by brand -> WIN-ASU-005   (brand shown only when the category has several brands)
// The number is the highest one already used with that prefix + 1, so numbers are never reused while the product exists.

function skuLetters(text: unknown, max = 3): string {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
}

async function generateSku(category: CategoryRecord, brand: string | null): Promise<string> {
    const parts = [skuLetters(category.name) || 'PRD'];
    if ((category.brands || []).length > 1 && brand) {
        const code = skuLetters(brand);
        if (code) parts.push(code);
    }
    const prefix = parts.join('-');

    const used = await ProductRepository.findSkusWithPrefix(`${prefix}-`);
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    let highest = 0;
    for (const sku of used) {
        const match = pattern.exec(sku);
        if (match) highest = Math.max(highest, Number(match[1]));
    }
    return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}

/** Applies the rules above to whichever of the three fields are present in `data` (works for create and update). */
function normalizePricing(data: Body): Body {
    const out: Body = { ...data };
    delete out.purchase_price; // no longer used
    if (data.selling_price !== undefined) out.selling_price = cleanMoney(data.selling_price, 'Price');
    if (data.extra_prices !== undefined) out.extra_prices = cleanExtraPrices(data.extra_prices);
    if (data.description !== undefined) out.description = cleanDescription(data.description);
    return out;
}

/** What the address narrows the list to: ?include_archived=true&category_id=2&brand=Dell&search=xps (all optional, and checked). */
function filtersOf(query: Body): ProductFilters {
    const filters: ProductFilters = { includeArchived: query.include_archived === 'true' };
    if (query.category_id !== undefined) {
        const text = String(query.category_id);
        if (!/^\d{1,9}$/.test(text) || Number(text) < 1) throw badRequest('category_id must be a whole number of 1 or more');
        filters.categoryId = Number(text);
    }
    if (query.brand !== undefined) {
        if (typeof query.brand !== 'string') throw badRequest('brand must be text');
        filters.brand = query.brand.trim() || undefined;
    }
    filters.search = cleanSearch(query.search) || undefined;
    return filters;
}

export class ProductService {
    static async getAllProducts(query: Body = {}): Promise<ProductRecord[]> {
        return await ProductRepository.findAll(filtersOf(query));
    }

    // One page of the same list.
    static async getProductPage(query: Body, page: PageRequest): Promise<Page<ProductRecord>> {
        const { rows, total } = await ProductRepository.findPage(filtersOf(query), page);
        return toPage(page, total, rows);
    }

    static async getProductById(id: string): Promise<ProductRecord> {
        const product = await ProductRepository.findById(id);
        if (!product) throw notFound('Product');
        return product;
    }

    // The laptop a QR code points at ("LP-0042"). Sold and set-aside laptops are found too: scanning one must say what it is.
    static async getProductByCode(code: string): Promise<ProductRecord> {
        const product = await ProductRepository.findByCode(code);
        if (!product) throw new AppError('No laptop has that code', 404);
        return product;
    }

    static async createProduct(data: Body): Promise<ProductRecord | undefined> {
        if (!String(data.name || '').trim() || !data.category_id) {
            throw badRequest('Name and category are required');
        }
        const category = await CategoryRepository.findById(data.category_id);
        if (!category) throw badRequest('Category not found');

        // SKU is optional: when it is empty we create one (e.g. MAC-007).
        const given = String(data.sku || '').trim();
        if (given && await ProductRepository.findBySku(given)) throw conflict('SKU already exists');

        const brand = resolveBrand(category, data.brand);
        const fields = { ...normalizeStock(normalizePricing(normalizePhotos(data))), brand, name: data.name.trim() };

        // Two people saving at the same moment could pick the same number: just try the next one.
        for (let attempt = 1; ; attempt++) {
            const sku = given || await generateSku(category, brand);
            try {
                const id = await ProductRepository.create({ ...fields, sku } as never);
                return await ProductRepository.findById(id);
            } catch (err) {
                if (given || !isDuplicateEntry(err) || attempt >= 5) throw err;
            }
        }
    }

    static async updateProduct(id: string, data: Body): Promise<ProductRecord | undefined> {
        const current = await ProductRepository.findById(id);
        if (!current) throw notFound('Product');

        const changes = normalizeStock(normalizePricing(normalizePhotos(data)), current);

        if (data.sku !== undefined) {
            const existing = await ProductRepository.findBySku(data.sku);
            if (existing && Number(existing.id) !== Number(id)) throw conflict('SKU already exists');
        }

        // Re-check the brand whenever the category or the brand changes.
        if (data.category_id !== undefined || data.brand !== undefined) {
            const categoryId = data.category_id !== undefined ? data.category_id : current.category_id;
            const category = await CategoryRepository.findById(categoryId);
            if (!category) throw badRequest('Category not found');

            const brand = data.brand !== undefined ? data.brand : current.brand;
            changes.brand = resolveBrand(category, brand);
        }

        const affected = await ProductRepository.update(id, changes);
        if (affected === 0) throw badRequest('Product not found or no changes');

        // Photos that were taken off the product -> delete their uploaded files (links to other sites are ignored).
        if (changes.images !== undefined) {
            const kept = new Set<string>(changes.images);
            photosOf(current).filter(photo => !kept.has(photo)).forEach(removeImage);
        }
        return await ProductRepository.findById(id);
    }

    static async deleteProduct(id: string): Promise<{ message: string }> {
        const current = await ProductRepository.findById(id);
        const affected = await ProductRepository.delete(id);
        if (affected === 0) throw notFound('Product');
        photosOf(current).forEach(removeImage);
        return { message: 'Product deleted successfully' };
    }

    static async getLowStock(): Promise<ProductRecord[]> {
        return await ProductRepository.getLowStock();
    }
}
