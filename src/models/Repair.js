const db = require('../config/database');

// A repair job: a laptop (the shop's or a customer's) in the shop, with 3 steps: received -> fixed -> picked up.
// Dates are handed back as plain "YYYY-MM-DD" text (not JS Dates), so a time zone can never move a day.
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

// Money comes out of MySQL as text ("60.00"): give back numbers (the cost may be empty = not set yet).
function normalize(row) {
    if (!row) return row;
    row.cost = row.cost === null ? null : Number(row.cost);
    row.sale_invoice_number = row.sale_invoice_number === null ? null : Number(row.sale_invoice_number);
    // Did this repair take one of the shop's laptops off the shelf (while it is 'received')? Is that laptop counted stock (true) or single (false)?
    row.stock_held = Boolean(row.stock_held);
    row.product_track_stock = row.product_track_stock === null || row.product_track_stock === undefined ? null : Boolean(row.product_track_stock);
    // The photos (what is wrong with it): a list of "/uploads/x.png".
    let images = row.images;
    if (typeof images === 'string') {
        try { images = JSON.parse(images); } catch { images = null; }
    }
    row.images = Array.isArray(images) ? images : [];
    return row;
}

class Repair {
    // Creates the table when it is missing (safe to run on every start). Same definition as schema.sql.
    static async ensureTable() {
        await db.query(`
            CREATE TABLE IF NOT EXISTS repairs (
              id INT AUTO_INCREMENT PRIMARY KEY,
              product_id INT DEFAULT NULL,
              device VARCHAR(80) NOT NULL,
              customer_name VARCHAR(100) DEFAULT NULL,
              phone VARCHAR(20) DEFAULT NULL,
              telegram VARCHAR(40) DEFAULT NULL,
              problem VARCHAR(140) NOT NULL,
              received_date DATE NOT NULL,
              back_on DATE DEFAULT NULL,
              cost DECIMAL(12,2) DEFAULT NULL,
              status ENUM('received', 'fixed', 'picked_up') NOT NULL DEFAULT 'received',
              fixed_date DATE DEFAULT NULL,
              picked_up_date DATE DEFAULT NULL,
              sale_invoice_id INT DEFAULT NULL,
              stock_held TINYINT(1) NOT NULL DEFAULT 0,
              images JSON DEFAULT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_repairs_status_received (status, received_date),
              INDEX idx_repairs_product_id (product_id),
              CONSTRAINT fk_repairs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
        `);

        // A table made before a column existed gets it now.
        const has = async (column) => {
            const [[found]] = await db.query(
                `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'repairs' AND COLUMN_NAME = ?`, [column]
            );
            return found.n > 0;
        };
        if (!(await has('stock_held'))) await db.query('ALTER TABLE repairs ADD COLUMN stock_held TINYINT(1) NOT NULL DEFAULT 0 AFTER sale_invoice_id');
        if (!(await has('images'))) await db.query('ALTER TABLE repairs ADD COLUMN images JSON DEFAULT NULL AFTER stock_held');
    }

    // True when any repair still uses this uploaded photo.
    static async usesPhoto(url) {
        const [rows] = await db.query('SELECT id FROM repairs WHERE images LIKE ? LIMIT 1', [`%${url}%`]);
        return rows.length > 0;
    }

    // What is still in the shop first (the one waiting longest on top); picked-up ones after them, newest first.
    static async findAll({ status } = {}) {
        const where = status ? 'WHERE r.status = ?' : '';
        const [rows] = await db.query(`
            ${SELECT}
            ${where}
            ORDER BY (r.status = 'picked_up'),
                     CASE WHEN r.status <> 'picked_up' THEN r.received_date END ASC,
                     r.picked_up_date DESC, r.id DESC
        `, status ? [status] : []);
        return rows.map(normalize);
    }

    static async findById(id) {
        const [rows] = await db.query(`${SELECT} WHERE r.id = ?`, [id]);
        return normalize(rows[0]);
    }

    static async create(data) {
        const [result] = await db.query(
            `INSERT INTO repairs (product_id, device, customer_name, phone, telegram, problem, received_date, back_on, cost,
                                  status, fixed_date, picked_up_date, sale_invoice_id, stock_held, images)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.product_id, data.device, data.customer_name, data.phone, data.telegram, data.problem, data.received_date,
             data.back_on, data.cost, data.status, data.fixed_date, data.picked_up_date, data.sale_invoice_id, data.stock_held ? 1 : 0,
             JSON.stringify(data.images ?? [])]
        );
        return result.insertId;
    }

    // `data` is always the complete, already-checked repair (the service merges the changes first).
    static async update(id, data) {
        const [result] = await db.query(
            `UPDATE repairs
             SET product_id = ?, device = ?, customer_name = ?, phone = ?, telegram = ?, problem = ?, received_date = ?,
                 back_on = ?, cost = ?, status = ?, fixed_date = ?, picked_up_date = ?, sale_invoice_id = ?, stock_held = ?, images = ?
             WHERE id = ?`,
            [data.product_id, data.device, data.customer_name, data.phone, data.telegram, data.problem, data.received_date,
             data.back_on, data.cost, data.status, data.fixed_date, data.picked_up_date, data.sale_invoice_id, data.stock_held ? 1 : 0,
             JSON.stringify(data.images ?? []), id]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await db.query('DELETE FROM repairs WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = Repair;
