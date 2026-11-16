const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

// Uploaded product images live on disk in Cafe_APi/uploads and are served at /uploads/<name>.
// The database only stores the short public path, e.g. "/uploads/3f2b...e1.jpg".
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const PUBLIC_PREFIX = '/uploads/';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

// The first bytes of a real image file. Stops someone renaming a script to .png.
function looksLikeImage(buf, ext) {
    switch (ext) {
        case 'png':  return buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
        case 'jpg':  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        case 'gif':  return buf.toString('latin1', 0, 4) === 'GIF8';
        case 'webp': return buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
        default:     return false;
    }
}

// dataUrl looks like "data:image/png;base64,iVBORw0KGgo..."
// Checks it and gives back the picture itself: { buffer, mime, ext }. Throws a plain-words message when it is not a real image.
function decodeImage(dataUrl) {
    const text = String(dataUrl || '');
    const marker = ';base64,';
    const split = text.indexOf(marker);
    if (!text.startsWith('data:') || split === -1) throw new Error('Invalid image data');

    const mime = text.slice(5, split).toLowerCase();
    const ext = EXTENSIONS[mime];
    if (!ext) throw new Error('Only PNG, JPG, WEBP or GIF images are allowed');

    const buffer = Buffer.from(text.slice(split + marker.length), 'base64');
    if (buffer.length === 0) throw new Error('The image is empty');
    if (buffer.length > MAX_BYTES) throw new Error('The image is too large (max 5 MB)');
    if (!looksLikeImage(buffer, ext)) throw new Error('That file is not a valid image');
    return { buffer, mime, ext };
}

async function saveImage(dataUrl) {
    const { buffer, ext } = decodeImage(dataUrl);
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer, { flag: 'wx' });
    return PUBLIC_PREFIX + name;
}

// Deletes an uploaded file. Ignores anything that is not a file we created
// (links to other websites, missing files, odd paths), so it is safe to call with any image_url.
function removeImage(url) {
    removeImageNow(url);   // fire and forget: a missing file is not an error
}

// Same, but lets you wait for it. Resolves true when a file was really deleted.
async function removeImageNow(url) {
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

/** True for a name we generated ourselves: "<uuid>.png|jpg|webp|gif". Nothing else may be deleted. */
function isUploadName(name) {
    return typeof name === 'string' && /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(name);
}

// Every photo of a product row, cover first, without repeats.
// `images` is the JSON list (it can still be a string); `image_url` is the cover and is also used for older rows
// that only have a single photo.
function photosOf(row) {
    let list = row ? row.images : null;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { list = []; }
    }
    const photos = Array.isArray(list) ? list.filter(u => typeof u === 'string' && u) : [];
    if (row && row.image_url && !photos.includes(row.image_url)) photos.unshift(row.image_url);
    return photos;
}

module.exports = { UPLOAD_DIR, PUBLIC_PREFIX, MAX_BYTES, decodeImage, saveImage, removeImage, removeImageNow, isUploadName, photosOf };
