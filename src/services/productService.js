const Product = require('../models/Product');
const Category = require('../models/Category');
const { removeImage, photosOf } = require('../utils/uploads');

// Brand rules come from the category's `brands` list (a JSON array in the categories table):
//   - several brands (e.g. Windows) -> brand is required and must be one of them
//   - exactly one brand (e.g. Mac)  -> that brand is filled in automatically
//   - no list                       -> brand is free text and optional
function resolveBrand(category, brand) {
    const options = category.brands || [];
    const value = String(brand ?? '').trim();

    if (options.length === 0) return value || null;
    if (options.length === 1) return options[0];

    if (!value) {
        throw new Error(`Brand is required for ${category.name}. Choose one of: ${options.join(', ')}`);
    }
    const match = options.find(o => o.toLowerCase() === value.toLowerCase());
    if (!match) {
        throw new Error(`Brand "${value}" is not allowed for ${category.name}. Choose one of: ${options.join(', ')}`);
    }
    return match;
}

// ---------- prices & description ----------

function cleanMoney(value, what) {
    const n = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < 0) {
        throw new Error(`${what} must be a number of 0 or more`);
    }
    return Math.round(n * 100) / 100;
}

// extra_prices: [{ label, price }] - extra price options such as "16GB / 512GB" or "Installment".
// Fully empty rows are ignored; a half-filled row is an error.
function cleanExtraPrices(list) {
    if (list === null || list === '') return [];
    if (!Array.isArray(list)) throw new Error('Extra prices must be a list');

    const rows = list.filter(r => r && (String(r.label ?? '').trim() !== '' || (r.price !== '' && r.price !== null && r.price !== undefined)));
    if (rows.length > 10) throw new Error('A product can have at most 10 extra prices');

    return rows.map((r, i) => {
        const label = String(r.label ?? '').trim();
        if (!label) throw new Error(`Extra price ${i + 1}: please add a label (e.g. "16GB / 512GB")`);
        if (label.length > 50) throw new Error(`Extra price ${i + 1}: the label is too long (max 50 characters)`);
        return { label, price: cleanMoney(r.price, `Extra price ${i + 1}`) };
    });
}

function cleanDescription(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\r\n/g, '\n').trim();
    if (text.length > 2000) throw new Error('Description is too long (max 2000 characters)');
    return text || null;
}

// ---------- stock ----------
// track_stock OFF = the product is a single item: stock is always 1 and there is no low-stock level.
// track_stock ON  = stock and min stock are whatever you enter (whole numbers, 0 or more).

function cleanCount(value, what) {
    const n = Number(value);
    if (value === '' || value === null || !Number.isInteger(n) || n < 0) {
        throw new Error(`${what} must be a whole number of 0 or more`);
    }
    return n;
}

/** `current` is the saved product when updating, or undefined when creating. */
function normalizeStock(data, current) {
    const out = { ...data };
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
function cleanPhoto(value) {
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (!text) return null;
    if (text.length > 500) {
        throw new Error('A photo link is too long (max 500 characters). Upload the picture as a file instead.');
    }
    if (!text.startsWith('/uploads/') && !/^https?:\/\/\S+$/i.test(text)) {
        throw new Error('A photo must be an uploaded file or a link that starts with http:// or https://');
    }
    return text;
}

/**
 * Keeps `images` (the list) and `image_url` (the cover = first photo) in step:
 *   images given   -> cleaned, no repeats, at most 8; image_url becomes the first one
 *   only image_url -> older callers: the list becomes just that one photo
 */
function normalizePhotos(data) {
    if (data.images !== undefined) {
        const list = data.images === null ? [] : data.images;
        if (!Array.isArray(list)) throw new Error('Photos must be a list');
        const photos = [];
        for (const item of list) {
            const photo = cleanPhoto(item);
            if (photo && !photos.includes(photo)) photos.push(photo);
        }
        if (photos.length > MAX_PHOTOS) throw new Error(`A product can have at most ${MAX_PHOTOS} photos`);
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

function skuLetters(text, max = 3) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
}

async function generateSku(category, brand) {
    const parts = [skuLetters(category.name) || 'PRD'];
    if ((category.brands || []).length > 1 && brand) {
        const code = skuLetters(brand);
        if (code) parts.push(code);
    }
    const prefix = parts.join('-');

    const used = await Product.findSkusWithPrefix(`${prefix}-`);
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    let highest = 0;
    for (const sku of used) {
        const match = pattern.exec(sku);
        if (match) highest = Math.max(highest, Number(match[1]));
    }
    return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}

/** Applies the rules above to whichever of the three fields are present in `data` (works for create and update). */
function normalizePricing(data) {
    const out = { ...data };
    delete out.purchase_price; // no longer used
    if (data.selling_price !== undefined) out.selling_price = cleanMoney(data.selling_price, 'Price');
    if (data.extra_prices !== undefined) out.extra_prices = cleanExtraPrices(data.extra_prices);
    if (data.description !== undefined) out.description = cleanDescription(data.description);
    return out;
}

class ProductService {
    static async getAllProducts(includeArchived = false) {
        return await Product.findAll({ includeArchived });
    }

    static async getProductById(id) {
        const product = await Product.findById(id);
        if (!product) throw new Error('Product not found');
        return product;
    }

    // The laptop a QR code points at ("LP-0042"). Sold and set-aside laptops are found too: scanning one must say what it is.
    static async getProductByCode(code) {
        const product = await Product.findByCode(code);
        if (!product) throw new Error('No laptop has that code');
        return product;
    }

    static async createProduct(data) {
        if (!String(data.name || '').trim() || !data.category_id) {
            throw new Error('Name and category are required');
        }
        const category = await Category.findById(data.category_id);
        if (!category) throw new Error('Category not found');

        // SKU is optional: when it is empty we create one (e.g. MAC-007).
        const given = String(data.sku || '').trim();
        if (given && await Product.findBySku(given)) throw new Error('SKU already exists');

        const brand = resolveBrand(category, data.brand);
        const fields = { ...normalizeStock(normalizePricing(normalizePhotos(data))), brand, name: data.name.trim() };

        // Two people saving at the same moment could pick the same number: just try the next one.
        for (let attempt = 1; ; attempt++) {
            const sku = given || await generateSku(category, brand);
            try {
                const id = await Product.create({ ...fields, sku });
                return await Product.findById(id);
            } catch (err) {
                if (given || err.code !== 'ER_DUP_ENTRY' || attempt >= 5) throw err;
            }
        }
    }

    static async updateProduct(id, data) {
        const current = await Product.findById(id);
        if (!current) throw new Error('Product not found');

        const changes = normalizeStock(normalizePricing(normalizePhotos(data)), current);

        if (data.sku !== undefined) {
            const existing = await Product.findBySku(data.sku);
            if (existing && Number(existing.id) !== Number(id)) throw new Error('SKU already exists');
        }

        // Re-check the brand whenever the category or the brand changes.
        if (data.category_id !== undefined || data.brand !== undefined) {
            const categoryId = data.category_id !== undefined ? data.category_id : current.category_id;
            const category = await Category.findById(categoryId);
            if (!category) throw new Error('Category not found');

            const brand = data.brand !== undefined ? data.brand : current.brand;
            changes.brand = resolveBrand(category, brand);
        }

        const affected = await Product.update(id, changes);
        if (affected === 0) throw new Error('Product not found or no changes');

        // Photos that were taken off the product -> delete their uploaded files (links to other sites are ignored).
        if (changes.images !== undefined) {
            const kept = new Set(changes.images);
            photosOf(current).filter(photo => !kept.has(photo)).forEach(removeImage);
        }
        return await Product.findById(id);
    }

    static async deleteProduct(id) {
        const current = await Product.findById(id);
        const affected = await Product.delete(id);
        if (affected === 0) throw new Error('Product not found');
        photosOf(current).forEach(removeImage);
        return { message: 'Product deleted successfully' };
    }

    static async getLowStock() {
        return await Product.getLowStock();
    }
}

module.exports = ProductService;
