import './helpers/env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/errors/app-error';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE, parsePageRequest, toPage } from '../src/utils/pagination';
import { cleanSearch, digitsOf, likePattern, phoneDigitsSql } from '../src/utils/search';

const errorOf = (run: () => unknown): AppError | null => {
    try { run(); return null; } catch (error) { return error as AppError; }
};

test('an address with no page and no per_page does not ask for pages: everything is answered, as before', () => {
    assert.equal(parsePageRequest({}), null);
    assert.equal(parsePageRequest({ status: 'booked', search: 'dell' }), null);
});

test('page and per_page are read; what is missing gets its default', () => {
    assert.deepEqual(parsePageRequest({ page: '3', per_page: '10' }), { page: 3, perPage: 10, limit: 10, offset: 20 });
    assert.deepEqual(parsePageRequest({ page: '2' }), { page: 2, perPage: DEFAULT_PER_PAGE, limit: DEFAULT_PER_PAGE, offset: DEFAULT_PER_PAGE });
    assert.deepEqual(parsePageRequest({ per_page: '50' }), { page: 1, perPage: 50, limit: 50, offset: 0 });
    assert.equal(parsePageRequest({ per_page: String(MAX_PER_PAGE) })?.perPage, MAX_PER_PAGE);
});

test('a page or a size that is not a whole number in range is a 400 that says so', () => {
    for (const page of ['0', '-1', '1.5', 'abc', '', ' ', '1e3', '99999999999']) {
        const error = errorOf(() => parsePageRequest({ page }));
        assert.equal(error?.statusCode, 400, `page=${page}`);
        assert.equal(error?.message, 'page must be a whole number of 1 or more');
    }
    for (const per_page of ['0', '101', '-5', 'ten', '', '2.5']) {
        const error = errorOf(() => parsePageRequest({ per_page }));
        assert.equal(error?.statusCode, 400, `per_page=${per_page}`);
        assert.equal(error?.message, 'per_page must be a whole number from 1 to 100');
    }
});

test('the same name twice in an address (a list, not text) is refused too', () => {
    assert.equal(errorOf(() => parsePageRequest({ page: ['1', '2'] }))?.statusCode, 400);
    assert.equal(errorOf(() => parsePageRequest({ per_page: { a: '1' } }))?.statusCode, 400);
});

test('toPage: the total pages are worked out, and are never 0', () => {
    const request = parsePageRequest({ page: '1', per_page: '10' })!;
    assert.equal(toPage(request, 0, []).total_pages, 1);
    assert.equal(toPage(request, 10, []).total_pages, 1);
    assert.equal(toPage(request, 11, []).total_pages, 2);
    assert.equal(toPage(request, 95, []).total_pages, 10);
});

test('toPage: the shape of the answer, with meta only when there is some', () => {
    const request = parsePageRequest({ page: '2', per_page: '2' })!;
    assert.deepEqual(toPage(request, 5, ['c', 'd']), { page: 2, per_page: 2, total: 5, total_pages: 3, results: ['c', 'd'] });
    assert.deepEqual(toPage(request, 5, ['c', 'd'], { counts: { all: 5 } }).meta, { counts: { all: 5 } });
});

test('a page beyond the last one is empty, and the total is still right', () => {
    const request = parsePageRequest({ page: '9', per_page: '10' })!;
    assert.deepEqual(toPage(request, 12, []), { page: 9, per_page: 10, total: 12, total_pages: 2, results: [] });
});

test('cleanSearch: trimmed, one space between words; no search is ""; text only; not too long', () => {
    assert.equal(cleanSearch(undefined), '');
    assert.equal(cleanSearch('   '), '');
    assert.equal(cleanSearch('  dell   xps  13 '), 'dell xps 13');
    assert.equal(errorOf(() => cleanSearch(['a', 'b']))?.message, 'search must be text');
    assert.equal(errorOf(() => cleanSearch('x'.repeat(101)))?.message, 'search is too long (max 100 characters)');
    assert.equal(cleanSearch('x'.repeat(100)).length, 100);
});

test('likePattern: what means something in a LIKE is written as plain text', () => {
    assert.equal(likePattern('dell'), '%dell%');
    assert.equal(likePattern('50%'), '%50\\%%');
    assert.equal(likePattern('a_b'), '%a\\_b%');
    assert.equal(likePattern('back\\slash'), '%back\\\\slash%');
});

test('digitsOf and the SQL for the digits of a phone column', () => {
    assert.equal(digitsOf('(099) 111-222'), '099111222');
    assert.equal(digitsOf('abc'), '');
    assert.equal(phoneDigitsSql('b.phone'), "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b.phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')");
});
