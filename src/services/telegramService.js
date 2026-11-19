// Sends the shop's messages to the Telegram groups with the shop's bots (see .env):
//   TELEGRAM_SOLD_BOT_TOKEN   + TELEGRAM_SOLD_CHAT_ID      the Sold group (also gets the Booking messages)
//   TELEGRAM_REPAIR_BOT_TOKEN + TELEGRAM_REPAIR_CHAT_ID    the Repair group
//   TELEGRAM_BOOKING_BOT_TOKEN + TELEGRAM_BOOKING_CHAT_ID  optional: a group / bot of its own for Booking messages
// A message that cannot be sent NEVER breaks the sale / booking / repair it is about: send() does not throw, it answers { ok: false, error }.
const fs = require('node:fs');
const path = require('node:path');
const { UPLOAD_DIR, PUBLIC_PREFIX, isUploadName } = require('../utils/uploads');

const API = 'https://api.telegram.org';
const CAPTION_MAX = 1024;      // Telegram's limit for text under a picture
const TEXT_MAX = 4096;         // ... and for a message with no picture
const TIMEOUT_MS = 25000;
const GROUPS = ['sold', 'repair', 'booking'];

// Telegram answered "this group became a supergroup": its new id, kept until the .env is changed.
const movedChats = new Map();

/** The bot token and the group id of a group, or null when it is not set up. A Booking without its own settings uses the Sold ones. */
function settingsFor(group) {
    const read = (name) => ({ token: (process.env[`TELEGRAM_${name}_BOT_TOKEN`] || '').trim(), chatId: (process.env[`TELEGRAM_${name}_CHAT_ID`] || '').trim() });
    let found = read(group.toUpperCase());
    if (group === 'booking' && !(found.token && found.chatId)) found = read('SOLD');
    if (!found.token || !found.chatId) return null;
    return { token: found.token, chatId: movedChats.get(found.chatId) || found.chatId };
}

/** Which groups can be written to right now (for the app: it says so when a group is not set up). */
function status() {
    return Object.fromEntries(GROUPS.map(group => [group, settingsFor(group) !== null]));
}

// A secret must never reach a log or a message shown on a screen.
function scrub(text, token) {
    let out = String(text || '');
    if (token) out = out.split(token).join('***');
    return out.replace(/bot\d+:[\w-]+/g, 'bot***');
}

class TelegramError extends Error {
    constructor(message, parameters) {
        super(message);
        this.parameters = parameters || {};
    }
}

/** One call of the Bot API. `files` = { name: { data: Buffer, type } } are sent as uploads next to the fields. */
async function call(token, method, fields, files = {}) {
    let body;
    const headers = {};
    if (Object.keys(files).length) {
        body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.append(key, typeof value === 'string' ? value : JSON.stringify(value));
        for (const [name, file] of Object.entries(files)) body.append(name, new Blob([file.data], { type: file.type }), file.filename);
    } else {
        body = JSON.stringify(fields);
        headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
        response = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
        throw new TelegramError(error.name === 'TimeoutError' ? 'Telegram did not answer in time' : 'Could not reach Telegram');
    }
    let answer;
    try { answer = await response.json(); } catch { throw new TelegramError(`Telegram answered with an error (${response.status})`); }
    if (!answer.ok) throw new TelegramError(answer.description || `Telegram answered with an error (${response.status})`, answer.parameters);
    return answer.result;
}

/** A photo as the Bot API wants it: an uploaded file of ours is read from disk, a web address is handed to Telegram, a Buffer is sent as it is. */
async function loadPhoto(photo, index) {
    if (Buffer.isBuffer(photo)) return { file: { data: photo, type: 'image/png', filename: `picture-${index}.png` } };
    const text = String(photo || '');
    if (text.startsWith(PUBLIC_PREFIX)) {
        const name = path.basename(text);
        if (!isUploadName(name)) return null;
        try {
            const data = await fs.promises.readFile(path.join(UPLOAD_DIR, name));
            const ext = name.split('.').pop();
            return { file: { data, type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, filename: name } };
        } catch {
            return null;       // the file is gone: the message goes without it
        }
    }
    if (/^https:\/\//i.test(text)) return { url: text };
    return null;
}

const MEDIA_PROBLEM = /wrong (file|type)|failed to get http url|image_process_failed|photo_|wrong remote file|webpage_|media/i;

/** Sends once to one chat. Answers the ids of the Telegram messages it made (a picture group is several), to take them down later. */
async function deliver(token, chatId, text, photos) {
    const loaded = (await Promise.all(photos.map(loadPhoto))).filter(Boolean);
    const caption = text.length <= CAPTION_MAX;
    const base = { chat_id: chatId, parse_mode: 'HTML' };
    const ids = [];
    const note = (result) => { for (const message of [].concat(result || [])) if (message && message.message_id) ids.push(message.message_id); };

    if (loaded.length === 0) {
        note(await call(token, 'sendMessage', { ...base, text: text.slice(0, TEXT_MAX), disable_web_page_preview: true }));
        return ids;
    }
    const files = {};
    const media = loaded.map((photo, i) => {
        let ref = photo.url;
        if (photo.file) { files[`photo${i}`] = photo.file; ref = `attach://photo${i}`; }
        return { type: 'photo', media: ref, ...(i === 0 && caption ? { caption: text, parse_mode: 'HTML' } : {}) };
    });
    if (media.length === 1) {
        const only = media[0];
        const fields = { ...base, photo: only.media, ...(caption ? { caption: text } : {}) };
        if (files.photo0) { delete fields.photo; note(await call(token, 'sendPhoto', fields, { photo: files.photo0 })); }
        else note(await call(token, 'sendPhoto', fields));
    } else {
        note(await call(token, 'sendMediaGroup', { chat_id: chatId, media }, files));
    }
    // Too long for a caption: the details follow as their own message.
    if (!caption) note(await call(token, 'sendMessage', { ...base, text: text.slice(0, TEXT_MAX), disable_web_page_preview: true }));
    return ids;
}

/**
 * Sends a message to a group. `photos`: laptop photo first, then the invoice picture (each an /uploads/ path, an https address or a Buffer).
 * Never throws: { ok: true, group, chatId, messageIds } or { ok: false, error } (plain words, no secrets).
 * (chatId + messageIds say exactly what was sent, so it can be taken down again with remove().)
 */
async function send(group, { text, photos = [] }) {
    const settings = settingsFor(group);
    if (!settings) return { ok: false, notSetUp: true, error: `Telegram is not set up for the ${group === 'sold' ? 'Sold' : group === 'repair' ? 'Repair' : 'Booking'} group yet` };
    const { token } = settings;
    let chatId = settings.chatId;
    try {
        for (let attempt = 0; ; attempt++) {
            try {
                const messageIds = await deliver(token, chatId, text, photos);
                return { ok: true, group, chatId, messageIds };
            } catch (error) {
                // The group became a supergroup: Telegram tells the new id. Use it (and keep it until the .env is changed).
                const moved = error.parameters && error.parameters.migrate_to_chat_id;
                if (moved && attempt === 0) {
                    const old = settings.chatId;
                    chatId = String(moved);
                    movedChats.set(old, chatId);
                    console.warn(`Telegram: the ${group} group moved to the id ${chatId}. Put it in the .env (it was ${old}).`);
                    continue;
                }
                // A photo Telegram cannot use must not lose the message: send the words alone.
                if (photos.length && attempt === 0 && MEDIA_PROBLEM.test(error.message)) {
                    const messageIds = await deliver(token, chatId, text, []);
                    return { ok: true, group, chatId, messageIds, withoutPhotos: true };
                }
                throw error;
            }
        }
    } catch (error) {
        return { ok: false, error: scrub(error.message, token) };
    }
}

/**
 * Takes messages down that the bot of this group sent. `sent` = [{ chat_id, ids: [..] }] (what send() answered).
 * Never throws: { removed, failed }. A message that is already gone counts as removed.
 */
async function remove(group, sent) {
    const settings = settingsFor(group);
    const all = (sent || []).flatMap(entry => (entry.ids || []).map(id => ({ chatId: entry.chat_id, id })));
    if (!settings) return { removed: 0, failed: all.length };
    let removed = 0;
    let failed = 0;
    for (const { chatId, id } of all) {
        try {
            await call(settings.token, 'deleteMessage', { chat_id: chatId, message_id: id });
            removed++;
        } catch (error) {
            if (/message to delete not found/i.test(error.message)) removed++;
            else {
                failed++;
                console.warn(`Telegram: a message could not be taken down (${scrub(error.message, settings.token)})`);
            }
        }
    }
    return { removed, failed };
}

module.exports = { send, remove, status, settingsFor, GROUPS, _movedChats: movedChats };
