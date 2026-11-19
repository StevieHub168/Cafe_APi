import { PhotoOwner } from '../enums/photo-owner.enum';
import { BookingRepository } from '../repositories/booking.repository';
import { ProductRepository } from '../repositories/product.repository';
import { RepairRepository } from '../repositories/repair.repository';
import { removeImage } from '../utils/uploads';

// An uploaded photo can belong to a product, a booking or a repair. These two helpers are the one place that knows it.

// What still uses this uploaded photo: a product, a booking, a repair, or null (nothing).
export async function whoUsesPhoto(url: string): Promise<PhotoOwner | null> {
    if (await ProductRepository.usesPhoto(url)) return PhotoOwner.PRODUCT;
    if (await BookingRepository.usesPhoto(url)) return PhotoOwner.BOOKING;
    if (await RepairRepository.usesPhoto(url)) return PhotoOwner.REPAIR;
    return null;
}

// Deletes uploaded files that nothing uses any more (a photo removed from a booking / repair, or one that was deleted).
// Called AFTER the database changed, so "in use" already reflects the new state.
export async function removeFilesNobodyUses(urls: string[]): Promise<void> {
    for (const url of urls) {
        if (!(await whoUsesPhoto(url))) removeImage(url);
    }
}
