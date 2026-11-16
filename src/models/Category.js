const db = require('../config/database');
const { photosOf } = require('../utils/uploads');

// `brands` is a JSON array column (e.g. ["Asus","Dell"]). Always hand back an array or null.
function withBrands(row) {
    if (!row) return row;
    let brands = row.brands;
    if (typeof brands === 'string') {
        try { brands = JSON.parse(brands); } catch { brands = null; }
    }
    row.brands = Array.isArray(brands) && brands.length > 0 ? brands : null;
    return row;
}

class Category {
    static async findAll() {
        const [rows] = await db.query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_archived = 0) AS product_count
            FROM categories c
            ORDER BY c.name
        `);
        return rows.map(withBrands);
    }

    static async findById(id) {
        const [rows] = await db.query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_archived = 0) AS product_count
            FROM categories c
            WHERE c.id = ?
        `, [id]);
        return withBrands(rows[0]);
    }

    static async findByName(name) {
        const [rows] = await db.query('SELECT * FROM categories WHERE name = ?', [name]);
        return withBrands(rows[0]);
    }

    static async create({ name, description }) {
        const [result] = await db.query(
            'INSERT INTO categories (name, description) VALUES (?, ?)',
            [name, description || null]
        );
        return result.insertId;
    }

    static async update(id, data) {
        const fields = [];
        const values = [];
        for (const key of ['name', 'description']) {
            if (data[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(data[key]);
            }
        }
        if (fields.length === 0) return 0;
        values.push(id);
        const [result] = await db.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
        return result.affectedRows;
    }

    // ---------- brands: stored as a JSON array in categories.brands ----------
    // Each method runs in one transaction on the locked category row, so two people editing at once can't clash.

    static async _withLockedCategory(work) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query('SELECT * FROM categories WHERE id = ? FOR UPDATE', [work.id]);
            const category = withBrands(rows[0]);
            if (!category) throw new Error('Category not found');
            const result = await work.run(conn, category, category.brands || []);
            await conn.commit();
            return result;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async addBrand(id, name) {
        return this._withLockedCategory({ id, run: async (conn, category, brands) => {
            if (brands.some(b => b.toLowerCase() === name.toLowerCase())) throw new Error('Brand already exists');
            await conn.query('UPDATE categories SET brands = ? WHERE id = ?', [JSON.stringify([...brands, name]), id]);
        } });
    }

    // Renames the brand in the list AND on every product that uses it.
    static async renameBrand(id, from, to) {
        return this._withLockedCategory({ id, run: async (conn, category, brands) => {
            const index = brands.findIndex(b => b.toLowerCase() === from.toLowerCase());
            if (index === -1) throw new Error('Brand not found');
            if (brands.some((b, i) => i !== index && b.toLowerCase() === to.toLowerCase())) throw new Error('Brand already exists');

            const next = [...brands];
            next[index] = to;
            await conn.query('UPDATE products SET brand = ? WHERE category_id = ? AND brand = ?', [to, id, brands[index]]);
            await conn.query('UPDATE categories SET brands = ? WHERE id = ?', [JSON.stringify(next), id]);
        } });
    }

    // Removes the brand from the list AND deletes every product of that brand.
    // Returns { deletedProducts, imageUrls }. If it was the last brand the list becomes empty (free-text brands).
    static async deleteBrand(id, name) {
        return this._withLockedCategory({ id, run: async (conn, category, brands) => {
            const index = brands.findIndex(b => b.toLowerCase() === name.toLowerCase());
            if (index === -1) throw new Error('Brand not found');
            const brand = brands[index];

            const [images] = await conn.query(
                'SELECT image_url, images FROM products WHERE category_id = ? AND brand = ?', [id, brand]);
            const [removed] = await conn.query('DELETE FROM products WHERE category_id = ? AND brand = ?', [id, brand]);

            const next = brands.filter((_, i) => i !== index);
            await conn.query('UPDATE categories SET brands = ? WHERE id = ?', [next.length ? JSON.stringify(next) : null, id]);
            return { deletedProducts: removed.affectedRows, imageUrls: images.flatMap(photosOf) };
        } });
    }

    // Deletes the category AND every product in it (archived ones too) in one transaction.
    // Returns { deleted, deletedProducts, imageUrls }. All-or-nothing: on any error nothing is removed.
    static async deleteWithProducts(id) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [images] = await conn.query('SELECT image_url, images FROM products WHERE category_id = ?', [id]);
            const [products] = await conn.query('DELETE FROM products WHERE category_id = ?', [id]);
            const [category] = await conn.query('DELETE FROM categories WHERE id = ?', [id]);
            await conn.commit();
            return { deleted: category.affectedRows, deletedProducts: products.affectedRows, imageUrls: images.flatMap(photosOf) };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }
}

module.exports = Category;
