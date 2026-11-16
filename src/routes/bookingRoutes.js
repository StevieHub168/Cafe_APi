const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, BookingController.getAllBookings);
router.get('/:id', requireAuth, BookingController.getBookingById);
router.post('/', requireAuth, BookingController.createBooking);
router.put('/:id', requireAuth, BookingController.updateBooking);
router.post('/:id/pickup', requireAuth, BookingController.pickUp);
router.delete('/:id', requireAuth, BookingController.deleteBooking);

module.exports = router;
