import { badRequest } from '../errors/app-error';

// What a search box sends (`search=...`): text that is looked for inside a few columns, capitals and extra spaces ignored.

const MAX_SEARCH = 100;

/** The search text, trimmed (no extra spaces), or '' when there is none. Throws when it is not text or too long. */
export function cleanSearch(value: unknown): string {
    if (value === undefined) return '';
    if (typeof value !== 'string') throw badRequest('search must be text');
    const text = value.trim().replace(/\s+/g, ' ');
    if (text.length > MAX_SEARCH) throw badRequest(`search is too long (max ${MAX_SEARCH} characters)`);
    return text;
}

/** "%text%" for a LIKE, with the characters that mean something in a LIKE (% _ \) written as plain text. */
export const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, match => `\\${match}`)}%`;

/** Only the digits of a text ("(099) 111-222" -> "099111222"). */
export const digitsOf = (text: string): string => text.replace(/\D/g, '');

/** The same for a COLUMN, in SQL. Phone numbers only hold digits, spaces, dashes, brackets and a leading + (see cleanPhone). */
export const phoneDigitsSql = (column: string): string =>
    `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')`;

/** A phone can be found by its digits when 3 or more were typed ("968" finds "+855 11 968 240"). */
export const MIN_PHONE_DIGITS = 3;
