const { saveImage, removeImageNow, isUploadName, PUBLIC_PREFIX } = require('../utils/uploads');
const Product = require('../models/Product');
const Booking = require('../models/Booking');

class UploadController {
    // POST /api/uploads/image   body: { data: "data:image/png;base64,...." }
    static async uploadImage(req, res) {
        try {
            const url = await saveImage(req.body?.data);
            res.status(201).json({ url });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /api/uploads/<file name>
    // Throws away a photo that was uploaded but never saved (the person removed it, or cancelled the form).
    // Refused when a product or a booking still uses it, so a saved photo can never be deleted this way.
    static async discardImage(req, res) {
        try {
            const name = req.params.name;
            if (!isUploadName(name)) {
                return res.status(400).json({ error: 'That is not an uploaded photo' });
            }
            const url = PUBLIC_PREFIX + name;
            if (await Product.usesPhoto(url)) {
                return res.status(409).json({ error: 'That photo is used by a product' });
            }
            if (await Booking.usesPhoto(url)) {
                return res.status(409).json({ error: 'That photo is used by a booking' });
            }
            await removeImageNow(url);
            res.status(200).json({ message: 'Photo removed' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = UploadController;
