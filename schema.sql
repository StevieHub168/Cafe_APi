-- ============================================
-- Schema for the current app: users + categories (Mac / Windows) + products + bookings + invoices
-- Matches the live laptop_repair_db after the 2026-11-09 clean-up.
-- Use on a NEW, empty database. (Existing databases were migrated in place.)
-- ============================================

CREATE DATABASE IF NOT EXISTS laptop_repair_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE laptop_repair_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
  phone VARCHAR(20) DEFAULT NULL,
  access_token VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  brands JSON DEFAULT NULL,  -- allowed brands, e.g. ["Asus","Dell"]; NULL = free-text brand
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  code VARCHAR(12) DEFAULT NULL,        -- the laptop code the QR points at: "LP-0042" (made from the id by the API)
  name VARCHAR(150) NOT NULL,
  category_id INT NOT NULL,
  brand VARCHAR(100) DEFAULT NULL,
  model VARCHAR(100) DEFAULT NULL,
  description TEXT DEFAULT NULL,        -- multi-line specs, e.g. "Chip M1 / Ram 8GB | Storage 256GB"
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  extra_prices JSON DEFAULT NULL,       -- other price options: [{"label":"16GB / 512GB","price":799}]
  track_stock TINYINT(1) NOT NULL DEFAULT 0,  -- 0 = single item (stock is always 1), 1 = count stock + low-stock alert
  stock_quantity INT NOT NULL DEFAULT 0,
  min_stock_level INT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,   -- a single laptop that was SOLD is archived (hidden from the Menu)
  hold_status ENUM('booked', 'repair') DEFAULT NULL,   -- a single laptop set aside for a booking / in repair (hidden from the Menu until it is free again)
  image_url VARCHAR(500) DEFAULT NULL,          -- the cover photo (= the first one in "images")
  images JSON DEFAULT NULL,                      -- every photo of the product, up to 8: ["/uploads/x.png", "https://..."]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_code (code),
  INDEX idx_products_category_id (category_id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- A customer reserves a laptop with a deposit and picks it up on a set date.
-- (The API also creates this table by itself on start when it is missing.)
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT DEFAULT NULL,           -- the catalogue product, if one was picked (kept NULL if that product is deleted later)
  product_name VARCHAR(255) NOT NULL,    -- as booked, e.g. "MacBook Air M5 | RAM 16GB | SSD 512GB"
  phone VARCHAR(20) DEFAULT NULL,
  telegram VARCHAR(40) DEFAULT NULL,     -- stored as "@username"
  full_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  deposit DECIMAL(12,2) NOT NULL DEFAULT 0,   -- the remaining balance is full_price - deposit (not stored)
  booking_date DATE NOT NULL,
  pickup_date DATE NOT NULL,
  status ENUM('booked', 'picked_up', 'cancelled') NOT NULL DEFAULT 'booked',
  images JSON DEFAULT NULL,              -- up to 4 uploaded photos, e.g. the deposit receipt: ["/uploads/x.png"]
  sale_invoice_id INT DEFAULT NULL,      -- the Sale (invoice) made when the customer picked the laptop up (no foreign key: a deleted invoice just shows no number)
  stock_held TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = this booking took one laptop off the shelf (counted stock -1, or a single laptop set aside); given back when it is cancelled / deleted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bookings_status_pickup (status, pickup_date),
  INDEX idx_bookings_product_id (product_id),
  CONSTRAINT fk_bookings_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- A repair job: a laptop (ours or a customer's) in the shop, with 3 steps: received -> fixed -> picked up.
-- Its invoice is optional (invoices.repair_id points back here). (The API also creates this table by itself on start when it is missing.)
CREATE TABLE IF NOT EXISTS repairs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT DEFAULT NULL,           -- one of the shop's laptops, if it was picked from Products
  device VARCHAR(80) NOT NULL,           -- the laptop or device, e.g. "Dell Inspiron 15"
  customer_name VARCHAR(100) DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  telegram VARCHAR(40) DEFAULT NULL,     -- stored as "@username"
  problem VARCHAR(140) NOT NULL,
  received_date DATE NOT NULL,
  back_on DATE DEFAULT NULL,             -- when it should be ready (optional)
  cost DECIMAL(12,2) DEFAULT NULL,       -- the price of the repair (optional)
  status ENUM('received', 'fixed', 'picked_up') NOT NULL DEFAULT 'received',
  fixed_date DATE DEFAULT NULL,
  picked_up_date DATE DEFAULT NULL,
  sale_invoice_id INT DEFAULT NULL,      -- the Sale of this laptop when WE sold it (a warranty repair); no foreign key: a deleted invoice just shows no number
  stock_held TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = this repair took one of the shop's laptops off the shelf while it is 'received'; given back when it is fixed / deleted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_repairs_status_received (status, received_date),
  INDEX idx_repairs_product_id (product_id),
  CONSTRAINT fk_repairs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- A printed paper (A5) for one sale, booking or repair. It keeps its own copy of everything printed on it.
-- (The API also creates this table by itself on start when it is missing.)
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number INT NOT NULL,                   -- printed with 6 digits: 41 -> 000041. The first digital invoice is 41 (the paper pad was at 40).
  type ENUM('sale', 'booking', 'repair') NOT NULL,
  invoice_date DATE NOT NULL,
  customer_name VARCHAR(100) DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  telegram VARCHAR(40) DEFAULT NULL,     -- stored as "@username"
  device VARCHAR(150) DEFAULT NULL,      -- repair only
  problem VARCHAR(255) DEFAULT NULL,     -- repair only
  pickup_date DATE DEFAULT NULL,         -- booking only
  booking_id INT DEFAULT NULL,           -- the booking this invoice was made from (one invoice per booking)
  repair_id INT DEFAULT NULL,            -- the repair job this invoice was made from (one invoice per repair)
  warranty ENUM('1_week', '2_weeks', '1_month', 'none') NOT NULL DEFAULT 'none',
  items JSON NOT NULL,                   -- [{"name":"MacBook Air M1","qty":1,"unit_price":799}] (sale: up to 9, booking: 5, repair: 7)
  total DECIMAL(12,2) NOT NULL DEFAULT 0,        -- worked out from the items
  deposit DECIMAL(12,2) NOT NULL DEFAULT 0,      -- the balance is total - deposit (not stored)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoices_number (number),
  UNIQUE KEY uq_invoices_booking (booking_id),
  UNIQUE KEY uq_invoices_repair (repair_id),
  INDEX idx_invoices_type_date (type, invoice_date),
  CONSTRAINT fk_invoices_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoices_repair FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE SET NULL
) ENGINE=InnoDB;
