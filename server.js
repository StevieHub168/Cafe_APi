require('dotenv').config();
const app = require('./src/app');
const db = require('./src/config/database');
const Product = require('./src/models/Product');
const Booking = require('./src/models/Booking');
const Invoice = require('./src/models/Invoice');
const Repair = require('./src/models/Repair');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Test database connection
        await db.query('SELECT 1');
        console.log('✓ Database connected successfully');

        await Product.ensureHoldColumn();   // "booked / in repair" for a single laptop (does nothing when it is there)
        await Product.ensureCodeColumn();   // the laptop code (LP-0042) the QR points at, also for products made before codes
        // Bookings were added after the first version: make sure their table exists (does nothing when it does).
        await Booking.ensureTable();
        await Invoice.ensureTable();     // (after bookings: an invoice can point at one)
        await Repair.ensureTable();      // Repairs: a job with 3 steps (received, fixed, picked up)
        await Invoice.ensureRepairLink();   // (after repairs: an invoice can point at one)

        // Start Express server
        app.listen(PORT, () => {
            console.log(`✓ Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('✗ Failed to start server:');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error:', error);
        process.exit(1);
    }
}

startServer();
