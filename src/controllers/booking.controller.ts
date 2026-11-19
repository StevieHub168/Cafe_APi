import { Request, Response } from 'express';
import { BookingService } from '../services/booking.service';
import { parsePageRequest } from '../utils/pagination';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status
// (a mistake in what was typed is a 400, a booking that does not exist is a 404, one that was already picked up is a 409).
export class BookingController {
    // GET /api/bookings?status=booked&exclude_status=picked_up&search=dell     every matching booking
    // GET /api/bookings?page=1&per_page=20                                      one page (see utils/pagination.ts)
    static async getAllBookings(req: Request, res: Response): Promise<void> {
        const page = parsePageRequest(req.query);
        res.status(200).json(page ? await BookingService.getBookingPage(req.query, page) : await BookingService.getAllBookings(req.query));
    }

    static async getBookingById(req: Request, res: Response): Promise<void> {
        res.status(200).json(await BookingService.getBookingById(String(req.params.id)));
    }

    static async createBooking(req: Request, res: Response): Promise<void> {
        res.status(201).json(await BookingService.createBooking(req.body));
    }

    static async updateBooking(req: Request, res: Response): Promise<void> {
        res.status(200).json(await BookingService.updateBooking(String(req.params.id), req.body));
    }

    // "The customer picked it up": the booking closes and a Sale is made (see BookingService.pickUp).
    static async pickUp(req: Request, res: Response): Promise<void> {
        res.status(201).json(await BookingService.pickUp(String(req.params.id), req.body));
    }

    static async deleteBooking(req: Request, res: Response): Promise<void> {
        res.status(200).json(await BookingService.deleteBooking(String(req.params.id)));
    }
}
