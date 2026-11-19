const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const repairRoutes = require('./routes/repairRoutes');
const telegramRoutes = require('./routes/telegramRoutes');
const configRoutes = require('./routes/configRoutes');
const { UPLOAD_DIR } = require('./utils/uploads');

const app = express();
app.disable('x-powered-by');

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200,http://localhost:4000').split(',');

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true
}));

// Images are sent as base64 inside JSON (max 5 MB image ~ 6.7 MB of text), so 10 MB is plenty.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Uploaded product images (public, so <img> tags can load them).
app.use('/uploads', express.static(UPLOAD_DIR, {
    index: false,
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/repairs', repairRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/config', configRoutes);

module.exports = app;
