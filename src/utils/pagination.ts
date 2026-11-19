import { badRequest } from '../errors/app-error';

// Pages are OPT-IN: a list address answers with every row (as it always did) unless `page` or `per_page` is in the address.
// Then it answers with ONE page, in this shape:
//   { page, per_page, total, total_pages, results: [...], meta: {...} }
//   GET /api/invoices?type=sale&page=2&per_page=20

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

/** What was asked: which page, how many on a page, and where it starts in the list. */
export interface PageRequest {
    page: number;
    perPage: number;
    limit: number;
    offset: number;
}

/** One page of a list. `meta` carries extra numbers for the screen (e.g. the counts of the tabs). */
export interface Page<T, M = undefined> {
    page: number;
    per_page: number;
    total: number;
    /** At least 1, also for an empty list, so a screen never has to say "page 1 of 0". */
    total_pages: number;
    results: T[];
    meta?: M;
}

function wholeNumber(value: unknown, error: string, min: number, max: number): number {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!/^\d{1,9}$/.test(text)) throw badRequest(error);
    const n = Number(text);
    if (n < min || n > max) throw badRequest(error);
    return n;
}

/** The page asked for in the address, or null when the address does not ask for pages (everything is answered then). */
export function parsePageRequest(query: Record<string, unknown>): PageRequest | null {
    if (query.page === undefined && query.per_page === undefined) return null;
    const page = query.page === undefined ? 1 : wholeNumber(query.page, 'page must be a whole number of 1 or more', 1, 1_000_000);
    const perPage = query.per_page === undefined
        ? DEFAULT_PER_PAGE
        : wholeNumber(query.per_page, `per_page must be a whole number from 1 to ${MAX_PER_PAGE}`, 1, MAX_PER_PAGE);
    return { page, perPage, limit: perPage, offset: (page - 1) * perPage };
}

/** Puts one page of rows in the answer's shape. A page beyond the last one is simply empty (the total is still right). */
export function toPage<T, M = undefined>(request: PageRequest, total: number, results: T[], meta?: M): Page<T, M> {
    const page: Page<T, M> = {
        page: request.page,
        per_page: request.perPage,
        total,
        total_pages: Math.max(1, Math.ceil(total / request.perPage)),
        results
    };
    if (meta !== undefined) page.meta = meta;
    return page;
}
