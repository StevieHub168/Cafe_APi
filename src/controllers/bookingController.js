const BookingService = require('../services/bookingService');

// A mistake in what was typed is a 400; a booking that does not exist is a 404; one that was already picked up is a 409.
const fail = (res, error) => res.status(error.statusCode || 400).json({ error: error.message });

class BookingController {
    static async getAllBookings(req, res) {
        try {
            res.status(200).json(await BookingService.getAllBookings(req.query.status));
        } catch (error) {
            fail(res, error);
        }
    }

    static async getBookingById(req, res) {
        try {
            res.status(200).json(await BookingService.getBookingById(req.params.id));
        } catch (error) {
            fail(res, error);
        }
    }

    static async createBooking(req, res) {
        try {
            res.status(201).json(await BookingService.createBooking(req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    static async updateBooking(req, res) {
        try {
            res.status(200).json(await BookingService.updateBooking(req.params.id, req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    // "The customer picked it up": the booking closes and a Sale is made (see BookingService.pickUp).
    static async pickUp(req, res) {
        try {
            res.status(201).json(await BookingService.pickUp(req.params.id, req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    static async deleteBooking(req, res) {
        try {
            res.status(200).json(await BookingService.deleteBooking(req.params.id));
        } catch (error) {
            fail(res, error);
        }
    }
}

module.exports = BookingController;
