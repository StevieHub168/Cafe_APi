const db = require('../config/database');
const { photosOf } = require('../utils/uploads');

const SELECT_WITH_CATEGORY = `
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
`;

// Two JSON columns are handed back as clean arrays so callers never deal with null/strings:
//   extra_prices: [{ "label": "16GB / 512GB", "price": 799 }, ...]
//   images:       ["https://...", "/uploads/....png", ...]   (the first one is the cover = image_url)
function normalize(row) {
    if (!row) return row;
    let extra = row.extra_prices;
    if (typeof extra === 'string') {
        try { extra = JSON.parse(extra); } catch { extra = null; }
    }
    row.extra_prices = Array.isArray(extra) ? extra : [];
    row.images = photosOf(row);
    return row;
}

// The code of a product made from its id: LP-0042 (more digits only after 9999).
const CODE_FROM_ID = "CONCAT('LP-', IF(id < 10000, LPAD(id, 4, '0'), CAST(id AS CHAR)))";

const asJson = (list) => (Array.isArray(list) && list.length ? JSON.stringify(list) : null);

class Product {
    // A product made before "booked / in repair" existed gets the column now (safe to run on every start).
    static async ensureHoldColumn() {
        const [[found]] = await db.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'hold_status'`
        );
        if (!found.n) await db.query("ALTER TABLE products ADD COLUMN hold_status ENUM('booked', 'repair') DEFAULT NULL AFTER is_archived");
    }

    // Every laptop has a short code ("LP-0042", the QR code points at it). Made from its id, so a code is never used twice,
    // not even after a product is deleted. A product made before codes existed gets its code now (safe to run on every start).
    static async ensureCodeColumn() {
        const [[found]] = await db.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'code'`
        );
        if (!found.n) await db.query('ALTER TABLE products ADD COLUMN code VARCHAR(12) DEFAULT NULL AFTER sku, ADD UNIQUE KEY uq_products_code (code)');
        await db.query(`UPDATE products SET code = ${CODE_FROM_ID} WHERE code IS NULL`);
    }

    // "lp-42" / "LP-0042" -> the product, or undefined.
    static async findByCode(code) {
        const clean = String(code || '').trim().toUpperCase();
        if (!/^LP-\d{1,9}$/.test(clean)) return undefined;
        const [rows] = await db.query(`${SELECT_WITH_CATEGORY} WHERE p.code = ?`, [clean]);
        return normalize(rows[0]);
    }

    // The Menu list (no includeArchived) shows what can be sold: not sold, not set aside for a booking, not in repair.
    static async findAll({ includeArchived = false } = {}) {
        const where = includeArchived ? '' : 'WHERE p.is_archived = 0 AND p.hold_status IS NULL';
        const [rows] = await db.query(`
            ${SELECT_WITH_CATEGORY}
            ${where}
            ORDER BY c.name, p.name
        `);
        return rows.map(normalize);
    }

    static async findById(id) {
        const [rows] = await db.query(`${SELECT_WITH_CATEGORY} WHERE p.id = ?`, [id]);
        return normalize(rows[0]);
    }

    static async findBySku(sku) {
        const [rows] = await db.query('SELECT * FROM products WHERE sku = ?', [sku]);
        return normalize(rows[0]);
    }

    // True when any product still uses this photo address (as its cover or in its photo list).
    static async usesPhoto(url) {
        const [rows] = await db.query('SELECT id FROM products WHERE image_url = ? OR images LIKE ? LIMIT 1', [url, `%${url}%`]);
        return rows.length > 0;
    }

    // All SKUs that start with the prefix (used to pick the next number). The prefix only ever holds A-Z, 0-9 and "-".
    static async findSkusWithPrefix(prefix) {
        const [rows] = await db.query('SELECT sku FROM products WHERE sku LIKE ?', [`${prefix}%`]);
        return rows.map(r => r.sku);
    }

    static async create(data) {
        const {
            sku, name, category_id, brand, model, description,
            selling_price, extra_prices, track_stock, stock_quantity,
            min_stock_level, image_url, images
        } = data;

        const [result] = await db.query(
            `INSERT INTO products (sku, name, category_id, brand, model, description, selling_price, extra_prices, track_stock, stock_quantity, min_stock_level, image_url, images)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sku, name, category_id, brand || null, model || null, description || null,
             selling_price || 0,
             asJson(extra_prices),
             track_stock ? 1 : 0, stock_quantity ?? 0, min_stock_level || 0,
             image_url || null, asJson(images)]
        );
        await db.query(`UPDATE products SET code = ${CODE_FROM_ID} WHERE id = ?`, [result.insertId]);
        return result.insertId;
    }

    static async update(id, data) {
        const fields = [];
        const values = [];
        const allowed = ['sku', 'name', 'category_id', 'brand', 'model', 'description',
            'selling_price', 'extra_prices', 'track_stock', 'stock_quantity', 'min_stock_level',
            'is_archived', 'image_url', 'images'];
        for (const key of allowed) {
            if (data[key] === undefined) continue;
            fields.push(`${key} = ?`);
            values.push(key === 'extra_prices' || key === 'images' ? asJson(data[key]) : data[key]);
        }
        if (fields.length === 0) return 0;
        values.push(id);
        const [result] = await db.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
        return result.affectedRows;
    }

    static async delete(id) {
        const [result] = await db.query('DELETE FROM products WHERE id = ?', [id]);
        return result.affectedRows;
    }

    // ---- taking one laptop off the shelf for a booking / a repair, and putting it back ----
    // Each is ONE statement, so two people acting at the same moment can never take the same single laptop.

    // Counted stock: one less (never below 0) -> 'stock'. A single laptop: set aside as 'booked' / 'repair', only when it is
    // free -> 'single'. null = nothing was taken (no such product, sold, already set aside, or counted stock with none left).
    static async takeOne(id, why) {
        const [counted] = await db.query(
            'UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = ? AND is_archived = 0 AND track_stock = 1 AND stock_quantity > 0', [id]);
        if (counted.affectedRows) return 'stock';
        const [single] = await db.query(
            'UPDATE products SET hold_status = ? WHERE id = ? AND is_archived = 0 AND track_stock = 0 AND hold_status IS NULL', [why, id]);
        return single.affectedRows ? 'single' : null;
    }

    // The other way: counted stock one more -> 'stock'; a single laptop is free again -> 'single'; null = nothing to give back.
    static async putBackOne(id) {
        if (id === null || id === undefined) return null;
        const [counted] = await db.query('UPDATE products SET stock_quantity = stock_quantity + 1 WHERE id = ? AND track_stock = 1', [id]);
        if (counted.affectedRows) return 'stock';
        const [single] = await db.query('UPDATE products SET hold_status = NULL WHERE id = ? AND track_stock = 0 AND hold_status IS NOT NULL', [id]);
        return single.affectedRows ? 'single' : null;
    }

    // A single laptop is sold: archived (hidden from the Menu) and no longer "set aside". true = it was a single laptop.
    static async markSold(id) {
        const [result] = await db.query('UPDATE products SET is_archived = 1, hold_status = NULL WHERE id = ? AND track_stock = 0', [id]);
        return result.affectedRows > 0;
    }

    static async getLowStock() {
        const [rows] = await db.query(`
            ${SELECT_WITH_CATEGORY}
            WHERE p.is_archived = 0 AND p.track_stock = 1 AND p.stock_quantity <= p.min_stock_level
            ORDER BY p.stock_quantity ASC
        `);
        return rows.map(normalize);
    }
}

module.exports = Product;
