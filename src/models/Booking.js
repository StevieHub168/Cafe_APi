const db = require('../config/database');

// A booking = a customer reserves a laptop with a deposit and will pick it up on a set date.
// Dates are handed back as plain "YYYY-MM-DD" text (not JS Dates), so a time zone can never move a day.
const asJson = (list) => (Array.isArray(list) && list.length ? JSON.stringify(list) : null);

const SELECT = `
    SELECT b.id, b.product_id, b.product_name, b.phone, b.telegram,
           b.full_price, b.deposit,
           DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
           DATE_FORMAT(b.pickup_date,  '%Y-%m-%d') AS pickup_date,
           b.status, b.images, b.sale_invoice_id, b.stock_held, b.created_at, b.updated_at,
           p.image_url AS product_image, p.track_stock AS product_track_stock,
           s.number AS sale_invoice_number
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN invoices s ON s.id = b.sale_invoice_id AND s.type = 'sale'
`;

// Money comes out of MySQL as text ("1050.00"): give back numbers, plus the balance still to pay.
function normalize(row) {
    if (!row) return row;
    let images = row.images;
    if (typeof images === 'string') {
        try { images = JSON.parse(images); } catch { images = null; }
    }
    row.images = Array.isArray(images) ? images : [];
    row.full_price = Number(row.full_price);
    row.deposit = Number(row.deposit);
    row.remaining_balance = Math.round((row.full_price - row.deposit) * 100) / 100;
    row.sale_invoice_number = row.sale_invoice_number === null || row.sale_invoice_number === undefined ? null : Number(row.sale_invoice_number);
    // Did this booking take a laptop off the shelf? And is that laptop counted stock (true) or a single one (false)? null = no laptop of the shop.
    row.stock_held = Boolean(row.stock_held);
    row.product_track_stock = row.product_track_stock === null || row.product_track_stock === undefined ? null : Boolean(row.product_track_stock);
    return row;
}

class Booking {
    // Creates the table when it is missing (safe to run on every start). Same definition as schema.sql.
    static async ensureTable() {
        await db.query(`
            CREATE TABLE IF NOT EXISTS bookings (
              id INT AUTO_INCREMENT PRIMARY KEY,
              product_id INT DEFAULT NULL,
              product_name VARCHAR(255) NOT NULL,
              phone VARCHAR(20) DEFAULT NULL,
              telegram VARCHAR(40) DEFAULT NULL,
              full_price DECIMAL(12,2) NOT NULL DEFAULT 0,
              deposit DECIMAL(12,2) NOT NULL DEFAULT 0,
              booking_date DATE NOT NULL,
              pickup_date DATE NOT NULL,
              status ENUM('booked', 'picked_up', 'cancelled') NOT NULL DEFAULT 'booked',
              images JSON DEFAULT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_bookings_status_pickup (status, pickup_date),
              INDEX idx_bookings_product_id (product_id),
              CONSTRAINT fk_bookings_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
        `);

        // A table made before photos were added gets the column now. (Same for the link to the Sale made at pickup.)
        const has = async (column) => {
            const [[found]] = await db.query(
                `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = ?`, [column]
            );
            return found.n > 0;
        };
        if (!(await has('images'))) await db.query('ALTER TABLE bookings ADD COLUMN images JSON DEFAULT NULL AFTER status');
        if (!(await has('sale_invoice_id'))) await db.query('ALTER TABLE bookings ADD COLUMN sale_invoice_id INT DEFAULT NULL AFTER images');
        if (!(await has('stock_held'))) await db.query('ALTER TABLE bookings ADD COLUMN stock_held TINYINT(1) NOT NULL DEFAULT 0 AFTER sale_invoice_id');
    }

    // True when any booking still uses this uploaded photo.
    static async usesPhoto(url) {
        const [rows] = await db.query('SELECT id FROM bookings WHERE images LIKE ? LIMIT 1', [`%${url}%`]);
        return rows.length > 0;
    }

    // Booked ones first, the soonest pickup on top; finished / cancelled ones after them, newest first.
    static async findAll({ status } = {}) {
        const where = status ? 'WHERE b.status = ?' : '';
        const [rows] = await db.query(`
            ${SELECT}
            ${where}
            ORDER BY (b.status <> 'booked'),
                     CASE WHEN b.status = 'booked' THEN b.pickup_date END ASC,
                     b.pickup_date DESC, b.id DESC
        `, status ? [status] : []);
        return rows.map(normalize);
    }

    static async findById(id) {
        const [rows] = await db.query(`${SELECT} WHERE b.id = ?`, [id]);
        return normalize(rows[0]);
    }

    static async create(data) {
        const [result] = await db.query(
            `INSERT INTO bookings (product_id, product_name, phone, telegram, full_price, deposit, booking_date, pickup_date, status, images, stock_held)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.product_id, data.product_name, data.phone, data.telegram,
             data.full_price, data.deposit, data.booking_date, data.pickup_date, data.status, asJson(data.images), data.stock_held ? 1 : 0]
        );
        return result.insertId;
    }

    // `data` is always the complete, already-checked booking (the service merges the changes first).
    static async update(id, data) {
        const [result] = await db.query(
            `UPDATE bookings
             SET product_id = ?, product_name = ?, phone = ?, telegram = ?, full_price = ?, deposit = ?,
                 booking_date = ?, pickup_date = ?, status = ?, images = ?,
                 sale_invoice_id = IF(? = 'picked_up', sale_invoice_id, NULL), stock_held = ?
             WHERE id = ?`,
            [data.product_id, data.product_name, data.phone, data.telegram,
             data.full_price, data.deposit, data.booking_date, data.pickup_date, data.status, asJson(data.images), data.status, data.stock_held ? 1 : 0, id]
        );
        return result.affectedRows > 0;
    }

    // "The customer picked it up": the first person to ask wins. false = it was not 'booked' any more (someone was faster).
    static async claimPickup(id) {
        const [result] = await db.query("UPDATE bookings SET status = 'picked_up' WHERE id = ? AND status = 'booked'", [id]);
        return result.affectedRows > 0;
    }

    // Undoes claimPickup when the Sale could not be made.
    static async releasePickup(id) {
        await db.query("UPDATE bookings SET status = 'booked', sale_invoice_id = NULL WHERE id = ? AND status = 'picked_up' AND sale_invoice_id IS NULL", [id]);
    }

    // The laptop of a picked-up booking is sold now: the booking no longer holds it.
    static async clearStockHeld(id) {
        await db.query('UPDATE bookings SET stock_held = 0 WHERE id = ?', [id]);
    }

    static async setSaleInvoice(id, invoiceId) {
        await db.query('UPDATE bookings SET sale_invoice_id = ? WHERE id = ?', [invoiceId, id]);
    }

    // The booking that became this Sale (the laptop it was about), or undefined.
    static async findBySaleInvoice(invoiceId) {
        const [rows] = await db.query(`${SELECT} WHERE b.sale_invoice_id = ?`, [invoiceId]);
        return normalize(rows[0]);
    }

    static async delete(id) {
        const [result] = await db.query('DELETE FROM bookings WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = Booking;
