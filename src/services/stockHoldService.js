const Product = require('../models/Product');

// A booking or a repair takes ONE laptop off the shelf, so nobody can sell it meanwhile:
//   counted stock  -> one less in stock; a single laptop -> set aside ("booked" / "in repair") and hidden from the Menu.
// It is given back when the booking is cancelled or deleted, or the repair is fixed or deleted.
// The booking / repair REMEMBERS whether it really took one (stock_held), so giving back never adds a laptop that was never taken.

const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

class StockHold {
    // For a booking. A single laptop that is sold or already set aside CANNOT be booked (409). Counted stock with none left
    // can still be booked (the laptop may be on its way): nothing is taken, and false is returned. true = a laptop was taken.
    static async holdForBooking(productId) {
        const product = await Product.findById(productId);
        if (!product) throw new Error('That product no longer exists');
        if (!product.track_stock) {
            if (product.is_archived) throw conflict('This laptop was already sold');
            if (product.hold_status === 'booked') throw conflict('This laptop is already booked');
            if (product.hold_status === 'repair') throw conflict('This laptop is in repair');
        }
        const taken = await Product.takeOne(productId, 'booked');
        // A single laptop that someone else took a moment ago:
        if (taken === null && !product.track_stock && !product.is_archived) throw conflict('This laptop was just booked by someone else');
        return taken !== null;
    }

    // For a repair of one of the shop's laptops: never refused (the laptop IS in the shop). true = a laptop was taken off the shelf.
    static async holdForRepair(productId) {
        return (await Product.takeOne(productId, 'repair')) !== null;
    }

    // Gives the laptop back (counted stock +1, or a single laptop is free again).
    static async release(productId) {
        await Product.putBackOne(productId);
    }

    // The booked laptop was picked up = SOLD: a single laptop is archived; counted stock stays as it is (its unit was taken at booking).
    static async sold(productId) {
        await Product.markSold(productId);
    }
}

module.exports = StockHold;
