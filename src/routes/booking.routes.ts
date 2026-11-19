import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, BookingController.getAllBookings);
router.get('/:id', requireAuth, BookingController.getBookingById);
router.post('/', requireAuth, BookingController.createBooking);
router.put('/:id', requireAuth, BookingController.updateBooking);
router.post('/:id/pickup', requireAuth, BookingController.pickUp);
router.delete('/:id', requireAuth, BookingController.deleteBooking);

export default router;
