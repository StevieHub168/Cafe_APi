const Product = require('../models/Product');
const Booking = require('../models/Booking');
const Repair = require('../models/Repair');
const { removeImage } = require('../utils/uploads');

// An uploaded photo can belong to a product, a booking or a repair. These two helpers are the one place that knows it.

// What still uses this uploaded photo: 'product', 'booking', 'repair' or null (nothing).
async function whoUsesPhoto(url) {
    if (await Product.usesPhoto(url)) return 'product';
    if (await Booking.usesPhoto(url)) return 'booking';
    if (await Repair.usesPhoto(url)) return 'repair';
    return null;
}

// Deletes uploaded files that nothing uses any more (a photo removed from a booking / repair, or one that was deleted).
// Called AFTER the database changed, so "in use" already reflects the new state.
async function removeFilesNobodyUses(urls) {
    for (const url of urls) {
        if (!(await whoUsesPhoto(url))) removeImage(url);
    }
}

module.exports = { whoUsesPhoto, removeFilesNobodyUses };
