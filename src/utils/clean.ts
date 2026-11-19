// Small checks shared by bookings and invoices: each one returns the tidy value, or throws a plain-words message.
import { badRequest } from '../errors/app-error';

export function cleanMoney(value: unknown, what: string): number {
    const n = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < 0) {
        throw badRequest(`${what} must be a number of 0 or more`);
    }
    return Math.round(n * 100) / 100;
}

// Digits, spaces, dashes, brackets and a leading "+" are fine ("011 968 240", "+855 11 968 240").
export function cleanPhone(value: unknown): string | null {
    const phone = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '').length;
    if (!/^\+?\d[\d ()-]*$/.test(phone) || phone.length > 20 || digits < 6) {
        throw badRequest('Phone number looks wrong. Use digits only, e.g. 011 968 240');
    }
    return phone;
}

// Always stored as "@username". A pasted link (t.me/name) is turned into the username.
// 2 to 32 letters, numbers or _ : Telegram says 5 or more, but older and bought usernames can be as short as 2.
export function cleanTelegram(value: unknown): string | null {
    let name = String(value ?? '').trim();
    if (!name) return null;
    name = name.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@+/, '').replace(/[/?#].*$/, '');
    if (!/^\w{2,32}$/.test(name)) {
        throw badRequest('Telegram username looks wrong. Example: @Horth_Heng (2-32 letters, numbers or _)');
    }
    return `@${name}`;
}

// "YYYY-MM-DD" and a day that really exists (no 2026-02-31).
export function cleanDate(value: unknown, what: string): string {
    const text = String(value ?? '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const date = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    const real = m && date && date.getUTCFullYear() === +m[1] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3];
    if (!real) throw badRequest(`${what} must be a real date`);
    return text;
}

/** A text without extra spaces, or null when it is empty. Throws when it is longer than `max`. */
export function optionalText(value: unknown, what: string, max: number): string | null {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (text.length > max) throw badRequest(`${what} is too long (max ${max} characters)`);
    return text || null;
}

/** Today as "YYYY-MM-DD" (the shop's own clock). */
export function todayText(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
