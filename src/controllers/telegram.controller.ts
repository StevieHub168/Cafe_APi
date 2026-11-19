import { Request, Response } from 'express';
import { TelegramGroup } from '../enums/telegram-group.enum';
import { badRequest } from '../errors/app-error';
import { BookingService } from '../services/booking.service';
import { KINDS, buildTelegramMessage } from '../services/telegram-messages.service';
import { TelegramService } from '../services/telegram.service';
import { decodeImage } from '../utils/uploads';

export class TelegramController {
    // GET /api/telegram/status -> { sold: true, repair: true, booking: true }   (false = that group is not set up in the .env)
    static status(_req: Request, res: Response): void {
        res.status(200).json(TelegramService.status());
    }

    // POST /api/telegram/send   body: { kind: "booking" | "repair" | "sold", id, picture?: "data:image/png;base64,..." }
    // Sends that booking / repair / sale to its group (laptop photo first, then the invoice picture when there is one).
    // The sale, booking or repair is already saved: when Telegram fails this only says so (502), nothing is undone.
    // A Booking message is remembered (its Telegram ids); when the Sale made from that booking is sent, the Booking message is taken
    // down again: the laptop is sold, the Sold message says so. Answer: { sent, group, withoutPhotos, removedBooking? }.
    static async send(req: Request, res: Response): Promise<void> {
        const { kind, picture } = req.body || {};
        const id = Number(req.body?.id);
        if (!KINDS.includes(kind)) throw badRequest(`kind must be one of: ${KINDS.join(', ')}`);
        if (!Number.isInteger(id) || id <= 0) throw badRequest('id must be a number');

        const hasPicture = picture !== undefined && picture !== null && picture !== '';
        const invoicePicture = hasPicture ? decodeImage(picture).buffer : null;

        const message = await buildTelegramMessage(kind, id);
        const answer = await TelegramService.send(message.group, { text: message.text, photos: [...message.photos, ...(invoicePicture ? [invoicePicture] : [])] });
        if (!answer.ok) {
            res.status(answer.notSetUp ? 503 : 502).json({ error: answer.error, notSetUp: !!answer.notSetUp });
            return;
        }

        let removedBooking = 0;
        if (kind === TelegramGroup.BOOKING) await BookingService.rememberTelegramMessages(id, answer.chatId, answer.messageIds);
        if (kind === TelegramGroup.SOLD) removedBooking = await BookingService.takeDownBookingMessage(id);
        res.status(200).json({ sent: true, group: answer.group, withoutPhotos: !!answer.withoutPhotos, ...(removedBooking > 0 ? { removedBooking: true } : {}) });
    }
}
