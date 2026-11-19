import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/error-handler.middleware';
import authRoutes from './routes/auth.routes';
import bookingRoutes from './routes/booking.routes';
import categoryRoutes from './routes/category.routes';
import configRoutes from './routes/config.routes';
import invoiceRoutes from './routes/invoice.routes';
import productRoutes from './routes/product.routes';
import repairRoutes from './routes/repair.routes';
import telegramRoutes from './routes/telegram.routes';
import uploadRoutes from './routes/upload.routes';
import userRoutes from './routes/user.routes';
import { UPLOAD_DIR } from './utils/uploads';

const app = express();
app.disable('x-powered-by');

// The tunnel (cloudflared) runs on this computer and passes the real address of the visitor on: req.ip is that visitor, not the tunnel.
app.set('trust proxy', 'loopback');

// Any website may call the API. That is safe here: signing in is a token the app sends itself (no cookies), so another website
// cannot use a visitor's sign-in. The app is opened from changing addresses (quick tunnels), so a fixed list would only get in the way.
app.use(cors());

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

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
