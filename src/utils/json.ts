// Small helpers for what MySQL hands back (a JSON column may arrive as text, as a list, or as null; a tinyint(1) as 0 / 1).

/** A JSON column as a list, or null when it holds no list. */
export function toList<T = unknown>(value: unknown): T[] | null {
    let list = value;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { list = null; }
    }
    return Array.isArray(list) ? (list as T[]) : null;
}

/** A tinyint(1) as true / false. */
export const toBool = (value: unknown): boolean => value === true || value === 1 || value === '1';

/** Like toBool, but a missing value stays null (e.g. a booking with no laptop of the shop). */
export const toBoolOrNull = (value: unknown): boolean | null => (value === null || value === undefined ? null : toBool(value));

/** A number from a column MySQL hands back as text ("1050.00"); a missing value stays null. */
export const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/** What is stored for a list of photos / prices: an empty list is stored as NULL. */
export const listOrNull = <T>(list: T[] | null | undefined): T[] | null => (Array.isArray(list) && list.length ? list : null);
