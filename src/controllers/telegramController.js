const Telegram = require('../services/telegramService');
const Messages = require('../services/telegramMessages');
const BookingService = require('../services/bookingService');
const { decodeImage } = require('../utils/uploads');

class TelegramController {
    // GET /api/telegram/status -> { sold: true, repair: true, booking: true }   (false = that group is not set up in the .env)
    static status(req, res) {
        res.status(200).json(Telegram.status());
    }

    // POST /api/telegram/send   body: { kind: "booking" | "repair" | "sold", id, picture?: "data:image/png;base64,..." }
    // Sends that booking / repair / sale to its group (laptop photo first, then the invoice picture when there is one).
    // The sale, booking or repair is already saved: when Telegram fails this only says so (502), nothing is undone.
    // A Booking message is remembered (its Telegram ids); when the Sale made from that booking is sent, the Booking message is taken
    // down again: the laptop is sold, the Sold message says so. Answer: { sent, group, withoutPhotos, removedBooking? }.
    static async send(req, res) {
        try {
            const { kind, picture } = req.body || {};
            const id = Number(req.body?.id);
            if (!Messages.KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of: ${Messages.KINDS.join(', ')}` });
            if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id must be a number' });

            let invoicePicture = null;
            if (picture !== undefined && picture !== null && picture !== '') {
                try { invoicePicture = decodeImage(picture).buffer; } catch (error) { return res.status(400).json({ error: error.message }); }
            }

            const message = await Messages.build(kind, id);
            const answer = await Telegram.send(message.group, { text: message.text, photos: [...message.photos, ...(invoicePicture ? [invoicePicture] : [])] });
            if (answer.ok) {
                let removedBooking = 0;
                if (kind === 'booking') await BookingService.rememberTelegramMessages(id, answer.chatId, answer.messageIds);
                if (kind === 'sold') removedBooking = await BookingService.takeDownBookingMessage(id);
                return res.status(200).json({ sent: true, group: answer.group, withoutPhotos: !!answer.withoutPhotos, ...(removedBooking > 0 ? { removedBooking: true } : {}) });
            }
            res.status(answer.notSetUp ? 503 : 502).json({ error: answer.error, notSetUp: !!answer.notSetUp });
        } catch (error) {
            res.status(error.statusCode || 400).json({ error: error.message });
        }
    }
}

module.exports = TelegramController;
