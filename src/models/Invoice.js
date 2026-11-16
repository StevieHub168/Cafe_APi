const db = require('../config/database');

// An invoice is a printed paper for ONE sale, booking or repair. It keeps its own copy of everything printed on it
// (customer, items, prices), so changing a product or a booking later never changes an invoice that was already given out.
// Dates are handed back as plain "YYYY-MM-DD" text (not JS Dates), so a time zone can never move a day.
const SELECT = `
    SELECT id, number, type,
           DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
           customer_name, phone, telegram, device, problem,
           DATE_FORMAT(pickup_date, '%Y-%m-%d') AS pickup_date,
           booking_id, repair_id, warranty, items, total, deposit, created_at, updated_at
    FROM invoices
`;

// JSON items come back as a clean list, money as numbers, plus the balance still to pay and the number as printed ("000041").
function normalize(row) {
    if (!row) return row;
    let items = row.items;
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
    }
    row.items = Array.isArray(items) ? items : [];
    row.total = Number(row.total);
    row.deposit = Number(row.deposit);
    row.balance = Math.round((row.total - row.deposit) * 100) / 100;
    row.number_text = String(row.number).padStart(6, '0');
    return row;
}

class Invoice {
    // Creates the table when it is missing (safe to run on every start). Same definition as schema.sql.
    static async ensureTable() {
        await db.query(`
            CREATE TABLE IF NOT EXISTS invoices (
              id INT AUTO_INCREMENT PRIMARY KEY,
              number INT NOT NULL,
              type ENUM('sale', 'booking', 'repair') NOT NULL,
              invoice_date DATE NOT NULL,
              customer_name VARCHAR(100) DEFAULT NULL,
              phone VARCHAR(20) DEFAULT NULL,
              telegram VARCHAR(40) DEFAULT NULL,
              device VARCHAR(150) DEFAULT NULL,
              problem VARCHAR(255) DEFAULT NULL,
              pickup_date DATE DEFAULT NULL,
              booking_id INT DEFAULT NULL,
              warranty ENUM('1_week', '2_weeks', '1_month', 'none') NOT NULL DEFAULT 'none',
              items JSON NOT NULL,
              total DECIMAL(12,2) NOT NULL DEFAULT 0,
              deposit DECIMAL(12,2) NOT NULL DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_invoices_number (number),
              UNIQUE KEY uq_invoices_booking (booking_id),
              INDEX idx_invoices_type_date (type, invoice_date),
              CONSTRAINT fk_invoices_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
        `);
    }

    // A repair job can have ONE invoice. This runs after the repairs table exists, and adds the link to an older
    // invoices table (a fresh schema.sql already has it). Safe to run on every start.
    static async ensureRepairLink() {
        const [[found]] = await db.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'repair_id'`
        );
        if (found.n) return;
        await db.query(`
            ALTER TABLE invoices
              ADD COLUMN repair_id INT DEFAULT NULL AFTER booking_id,
              ADD UNIQUE KEY uq_invoices_repair (repair_id),
              ADD CONSTRAINT fk_invoices_repair FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE SET NULL
        `);
    }

    // The highest number used so far (null when there is no invoice yet).
    static async highestNumber() {
        const [[row]] = await db.query('SELECT MAX(number) AS highest FROM invoices');
        return row.highest === null ? null : Number(row.highest);
    }

    // Newest number first.
    static async findAll({ type } = {}) {
        const where = type ? 'WHERE type = ?' : '';
        const [rows] = await db.query(`${SELECT} ${where} ORDER BY number DESC`, type ? [type] : []);
        return rows.map(normalize);
    }

    static async findById(id) {
        const [rows] = await db.query(`${SELECT} WHERE id = ?`, [id]);
        return normalize(rows[0]);
    }

    static async create(data) {
        const [result] = await db.query(
            `INSERT INTO invoices (number, type, invoice_date, customer_name, phone, telegram, device, problem, pickup_date, booking_id, repair_id, warranty, items, total, deposit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.number, data.type, data.invoice_date, data.customer_name, data.phone, data.telegram, data.device, data.problem,
             data.pickup_date, data.booking_id, data.repair_id, data.warranty, JSON.stringify(data.items), data.total, data.deposit]
        );
        return result.insertId;
    }

    // `data` is always the complete, already-checked invoice (the service merges the changes first).
    static async update(id, data) {
        const [result] = await db.query(
            `UPDATE invoices
             SET number = ?, invoice_date = ?, customer_name = ?, phone = ?, telegram = ?, device = ?, problem = ?,
                 pickup_date = ?, booking_id = ?, repair_id = ?, warranty = ?, items = ?, total = ?, deposit = ?
             WHERE id = ?`,
            [data.number, data.invoice_date, data.customer_name, data.phone, data.telegram, data.device, data.problem,
             data.pickup_date, data.booking_id, data.repair_id, data.warranty, JSON.stringify(data.items), data.total, data.deposit, id]
        );
        return result.affectedRows > 0;
    }

    // A booking or a repair that pointed at this Sale stops pointing at it (the link has no foreign key).
    static async delete(id) {
        await db.query('UPDATE bookings SET sale_invoice_id = NULL WHERE sale_invoice_id = ?', [id]);
        await db.query('UPDATE repairs SET sale_invoice_id = NULL WHERE sale_invoice_id = ?', [id]);
        const [result] = await db.query('DELETE FROM invoices WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = Invoice;
