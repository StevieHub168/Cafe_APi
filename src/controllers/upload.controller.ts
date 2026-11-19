import { Request, Response } from 'express';
import { badRequest, conflict } from '../errors/app-error';
import { whoUsesPhoto } from '../services/photo.service';
import { PUBLIC_PREFIX, isUploadName, removeImageNow, saveImage } from '../utils/uploads';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status.
export class UploadController {
    // POST /api/uploads/image   body: { data: "data:image/png;base64,...." }
    static async uploadImage(req: Request, res: Response): Promise<void> {
        const url = await saveImage(req.body?.data);
        res.status(201).json({ url });
    }

    // DELETE /api/uploads/<file name>
    // Throws away a photo that was uploaded but never saved (the person removed it, or cancelled the form).
    // Refused when a product, a booking or a repair still uses it, so a saved photo can never be deleted this way.
    static async discardImage(req: Request, res: Response): Promise<void> {
        const name = String(req.params.name);
        if (!isUploadName(name)) throw badRequest('That is not an uploaded photo');

        const url = PUBLIC_PREFIX + name;
        const user = await whoUsesPhoto(url);
        if (user) throw conflict(`That photo is used by a ${user}`);

        await removeImageNow(url);
        res.status(200).json({ message: 'Photo removed' });
    }
}
