// Makes sure the tables and columns that were added after the first version exist. Safe to run on every start: it only adds what is missing.
// The first tables (users, categories, products) come from schema.sql. Same definitions as schema.sql.
import { QueryTypes } from 'sequelize';
import { BookingStatus } from '../enums/booking-status.enum';
import { HoldStatus } from '../enums/hold-status.enum';
import { InvoiceType } from '../enums/invoice-type.enum';
import { RepairStatus } from '../enums/repair-status.enum';
import { Warranty } from '../enums/warranty.enum';
import { sequelize } from './database';
import { CODE_FROM_ID, sqlList } from './sql';

async function hasColumn(table: string, column: string): Promise<boolean> {
    const [found] = await sequelize.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        { replacements: [table, column], type: QueryTypes.SELECT }
    );
    return Number(found.n) > 0;
}

const run = (sql: string) => sequelize.query(sql);

// A product made before "booked / in repair" existed gets the column now.
async function ensureHoldColumn(): Promise<void> {
    if (!(await hasColumn('products', 'hold_status'))) {
        await run(`ALTER TABLE products ADD COLUMN hold_status ENUM(${sqlList(Object.values(HoldStatus))}) DEFAULT NULL AFTER is_archived`);
    }
}

// Every laptop has a short code ("LP-0042", the QR code points at it). Made from its id, so a code is never used twice,
// not even after a product is deleted. A product made before codes existed gets its code now.
async function ensureCodeColumn(): Promise<void> {
    if (!(await hasColumn('products', 'code'))) {
        await run('ALTER TABLE products ADD COLUMN code VARCHAR(12) DEFAULT NULL AFTER sku, ADD UNIQUE KEY uq_products_code (code)');
    }
    await run(`UPDATE products SET code = ${CODE_FROM_ID} WHERE code IS NULL`);
}

async function ensureBookingsTable(): Promise<void> {
    await run(`
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
          status ENUM(${sqlList(Object.values(BookingStatus))}) NOT NULL DEFAULT '${BookingStatus.BOOKED}',
          images JSON DEFAULT NULL,
          telegram_messages JSON DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_bookings_status_pickup (status, pickup_date),
          INDEX idx_bookings_product_id (product_id),
          CONSTRAINT fk_bookings_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        ) ENGINE=InnoDB
    `);

    // A table made before photos were added gets the column now. (Same for the link to the Sale made at pickup.)
    if (!(await hasColumn('bookings', 'images'))) await run('ALTER TABLE bookings ADD COLUMN images JSON DEFAULT NULL AFTER status');
    if (!(await hasColumn('bookings', 'sale_invoice_id'))) await run('ALTER TABLE bookings ADD COLUMN sale_invoice_id INT DEFAULT NULL AFTER images');
    if (!(await hasColumn('bookings', 'stock_held'))) await run('ALTER TABLE bookings ADD COLUMN stock_held TINYINT(1) NOT NULL DEFAULT 0 AFTER sale_invoice_id');
    if (!(await hasColumn('bookings', 'telegram_messages'))) await run('ALTER TABLE bookings ADD COLUMN telegram_messages JSON DEFAULT NULL AFTER stock_held');
}

async function ensureInvoicesTable(): Promise<void> {
    await run(`
        CREATE TABLE IF NOT EXISTS invoices (
          id INT AUTO_INCREMENT PRIMARY KEY,
          number INT NOT NULL,
          type ENUM(${sqlList(Object.values(InvoiceType))}) NOT NULL,
          invoice_date DATE NOT NULL,
          customer_name VARCHAR(100) DEFAULT NULL,
          phone VARCHAR(20) DEFAULT NULL,
          telegram VARCHAR(40) DEFAULT NULL,
          device VARCHAR(150) DEFAULT NULL,
          problem VARCHAR(255) DEFAULT NULL,
          pickup_date DATE DEFAULT NULL,
          booking_id INT DEFAULT NULL,
          warranty ENUM(${sqlList(Object.values(Warranty))}) NOT NULL DEFAULT '${Warranty.NONE}',
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

async function ensureRepairsTable(): Promise<void> {
    await run(`
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
          status ENUM(${sqlList(Object.values(RepairStatus))}) NOT NULL DEFAULT '${RepairStatus.RECEIVED}',
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
    if (!(await hasColumn('repairs', 'stock_held'))) await run('ALTER TABLE repairs ADD COLUMN stock_held TINYINT(1) NOT NULL DEFAULT 0 AFTER sale_invoice_id');
    if (!(await hasColumn('repairs', 'images'))) await run('ALTER TABLE repairs ADD COLUMN images JSON DEFAULT NULL AFTER stock_held');
}

// A repair job can have ONE invoice. This runs after the repairs table exists, and adds the link to an older
// invoices table (a fresh schema.sql already has it).
async function ensureInvoiceRepairLink(): Promise<void> {
    if (await hasColumn('invoices', 'repair_id')) return;
    await run(`
        ALTER TABLE invoices
          ADD COLUMN repair_id INT DEFAULT NULL AFTER booking_id,
          ADD UNIQUE KEY uq_invoices_repair (repair_id),
          ADD CONSTRAINT fk_invoices_repair FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE SET NULL
    `);
}

/** In this order: a table can point at one made before it. */
export async function ensureSchema(): Promise<void> {
    await ensureHoldColumn();               // "booked / in repair" for a single laptop
    await ensureCodeColumn();               // the laptop code (LP-0042) the QR points at, also for products made before codes
    await ensureBookingsTable();            // bookings were added after the first version
    await ensureInvoicesTable();            // (after bookings: an invoice can point at one)
    await ensureRepairsTable();             // repairs: a job with 3 steps (received, fixed, picked up)
    await ensureInvoiceRepairLink();        // (after repairs: an invoice can point at one)
}
