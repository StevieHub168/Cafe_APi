import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest } from '../errors/app-error';

// Uploaded product images live on disk in Cafe_APi/uploads (or UPLOAD_DIR) and are served at /uploads/<name>.
// The database only stores the short public path, e.g. "/uploads/3f2b...e1.jpg".
export const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(process.cwd(), 'uploads');
export const PUBLIC_PREFIX = '/uploads/';
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type ImageExtension = 'png' | 'jpg' | 'webp' | 'gif';

const EXTENSIONS: Record<string, ImageExtension> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

// The first bytes of a real image file. Stops someone renaming a script to .png.
function looksLikeImage(buf: Buffer, ext: ImageExtension): boolean {
    switch (ext) {
        case 'png':  return buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
        case 'jpg':  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        case 'gif':  return buf.toString('latin1', 0, 4) === 'GIF8';
        case 'webp': return buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
    }
}

export interface DecodedImage { buffer: Buffer; mime: string; ext: ImageExtension }

// dataUrl looks like "data:image/png;base64,iVBORw0KGgo..."
// Checks it and gives back the picture itself. Throws a plain-words message when it is not a real image.
export function decodeImage(dataUrl: unknown): DecodedImage {
    const text = String(dataUrl || '');
    const marker = ';base64,';
    const split = text.indexOf(marker);
    if (!text.startsWith('data:') || split === -1) throw badRequest('Invalid image data');

    const mime = text.slice(5, split).toLowerCase();
    const ext = EXTENSIONS[mime];
    if (!ext) throw badRequest('Only PNG, JPG, WEBP or GIF images are allowed');

    const buffer = Buffer.from(text.slice(split + marker.length), 'base64');
    if (buffer.length === 0) throw badRequest('The image is empty');
    if (buffer.length > MAX_BYTES) throw badRequest('The image is too large (max 5 MB)');
    if (!looksLikeImage(buffer, ext)) throw badRequest('That file is not a valid image');
    return { buffer, mime, ext };
}

export async function saveImage(dataUrl: unknown): Promise<string> {
    const { buffer, ext } = decodeImage(dataUrl);
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer, { flag: 'wx' });
    return PUBLIC_PREFIX + name;
}

/** True for a name we generated ourselves: "<uuid>.png|jpg|webp|gif". Nothing else may be deleted. */
export function isUploadName(name: unknown): boolean {
    return typeof name === 'string' && /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(name);
}

// Same, but lets you wait for it. Resolves true when a file was really deleted.
export async function removeImageNow(url: unknown): Promise<boolean> {
    if (typeof url !== 'string' || !url.startsWith(PUBLIC_PREFIX)) return false;
    const name = path.basename(url); // drops any "../" tricks
    if (!isUploadName(name)) return false;
    try {
        await fs.promises.unlink(path.join(UPLOAD_DIR, name));
        return true;
    } catch {
        return false;      // already gone
    }
}

// Deletes an uploaded file. Ignores anything that is not a file we created
// (links to other websites, missing files, odd paths), so it is safe to call with any image_url.
export function removeImage(url: unknown): void {
    void removeImageNow(url);   // fire and forget: a missing file is not an error
}

/** Anything with photos: a product has `images` and a cover `image_url`; a booking or a repair has `images`. */
interface HasPhotos { images?: unknown; image_url?: unknown }

// Every photo of a product / booking / repair row, cover first, without repeats.
// `images` is the JSON list (it can still be a string); `image_url` is the cover and is also used for older rows
// that only have a single photo.
export function photosOf(row: HasPhotos | null | undefined): string[] {
    let list: unknown = row ? row.images : null;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { list = []; }
    }
    const photos = Array.isArray(list) ? list.filter((u): u is string => typeof u === 'string' && u !== '') : [];
    if (row && row.image_url && typeof row.image_url === 'string' && !photos.includes(row.image_url)) photos.unshift(row.image_url);
    return photos;
}

// The photos a booking / repair is saved with: only files uploaded through this app, no repeats, at most `max`.
// `who` is the word used in the error ("booking", "repair").
export function cleanUploadedPhotos(list: unknown, who: string, max: number): string[] {
    if (list === null || list === undefined || list === '') return [];
    if (!Array.isArray(list)) throw badRequest('Photos must be a list');
    const photos: string[] = [];
    for (const item of list) {
        const url = String(item ?? '').trim();
        if (!url.startsWith(PUBLIC_PREFIX) || !isUploadName(url.slice(PUBLIC_PREFIX.length))) {
            throw badRequest(`A ${who} photo must be one uploaded from this app`);
        }
        if (!photos.includes(url)) photos.push(url);
    }
    if (photos.length > max) throw badRequest(`A ${who} can have at most ${max} photos`);
    return photos;
}
