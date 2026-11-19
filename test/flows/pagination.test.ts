// Pages, search, filters and the numbers of the tabs, through the real HTTP API against a THROWAWAY database.
//   TEST_DB_NAME=laptop_repair_test npm test
/* eslint-disable @typescript-eslint/no-explicit-any */
import '../helpers/env';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFlowServer } from './harness';

const TEST_DB = process.env.TEST_DB_NAME;
const skip = TEST_DB ? false : 'set TEST_DB_NAME (a throwaway database, e.g. laptop_repair_test) to run the pagination test';

let base = '';
let stop: (() => Promise<void>) | undefined;
let token = '';

const api = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
};
const ok = async (method: string, path: string, body?: unknown): Promise<any> => {
    const answer = await api(method, path, body);
    assert.ok(answer.status < 300, `${method} ${path} answered ${answer.status}: ${JSON.stringify(answer.body)}`);
    return answer.body;
};
const get = (path: string) => ok('GET', path);

// ---------- dates (the shop's own clock) ----------
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromToday = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// The warranty rules, written again here on purpose: the API must agree with them.
function warrantyEnd(date: string, warranty: string): string | null {
    const [y, m, d] = date.split('-').map(Number);
    if (warranty === '1_week') return iso(new Date(y, m - 1, d + 7));
    if (warranty === '2_weeks') return iso(new Date(y, m - 1, d + 14));
    if (warranty === '1_month') return iso(new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate())));
    return null;
}
const underWarranty = (date: string, warranty: string) => { const end = warrantyEnd(date, warranty); return end !== null && end >= iso(new Date()); };
const thisMonth = (date: string) => date.slice(0, 7) === iso(new Date()).slice(0, 7);

const ids = (rows: { id: number }[]) => rows.map(row => row.id);

/** Reads a whole list page by page. Gives back every row, in the order the pages came. */
async function readAllPages(path: string, perPage: number): Promise<{ rows: any[]; pages: any[] }> {
    const joiner = path.includes('?') ? '&' : '?';
    const pages: any[] = [];
    for (let page = 1; ; page++) {
        const answer = await get(`${path}${joiner}page=${page}&per_page=${perPage}`);
        pages.push(answer);
        if (page >= answer.total_pages) break;
    }
    return { rows: pages.flatMap(p => p.results), pages };
}

const seeded: { macId: number; winId: number; sales: { id: number; number: number; date: string; warranty: string }[]; customerSaleNumber: number } = {
    macId: 0, winId: 0, sales: [], customerSaleNumber: 0
};

before(async () => {
    if (!TEST_DB) return;
    ({ base, stop } = await startFlowServer(TEST_DB));
    token = (await ok('POST', '/auth/login', { email: 'owner@test.local', password: 'Admin-pass-1' })).token;

    // ----- categories and 25 products -----
    seeded.macId = (await ok('POST', '/categories', { name: 'Mac' })).id;
    seeded.winId = (await ok('POST', '/categories', { name: 'Windows' })).id;
    await ok('POST', `/categories/${seeded.macId}/brands`, { name: 'Apple' });
    await ok('POST', `/categories/${seeded.winId}/brands`, { name: 'Asus' });
    await ok('POST', `/categories/${seeded.winId}/brands`, { name: 'Dell' });
    const productIds: number[] = [];
    for (let n = 1; n <= 11; n++) productIds.push((await ok('POST', '/products', { name: `MacBook ${pad(n)}`, category_id: seeded.macId, selling_price: 1000 + n })).id);
    productIds.push((await ok('POST', '/products', { name: 'Promo 50% off', category_id: seeded.macId, selling_price: 99 })).id);   // 12 Macs
    for (let n = 1; n <= 13; n++) productIds.push((await ok('POST', '/products', { name: `Dell XPS ${pad(n)}`, category_id: seeded.winId, brand: 'Dell', selling_price: 700 + n })).id);

    // ----- 25 bookings: 20 booked, 3 cancelled, 2 picked up (those 2 became Sales and their laptops are sold) -----
    const booking = (n: number, extra: Record<string, unknown> = {}) => ({
        product_name: `Booking ${pad(n)}`, telegram: `@client${pad(n)}`, full_price: 500 + n, deposit: 100, booking_date: daysFromToday(-3), pickup_date: daysFromToday(n), ...extra
    });
    for (let n = 1; n <= 16; n++) await ok('POST', '/bookings', booking(n, n === 5 ? { phone: '+855 11 968 240' } : {}));
    const cancelled: number[] = [];
    for (let n = 17; n <= 19; n++) cancelled.push((await ok('POST', '/bookings', booking(n))).id);
    for (const id of cancelled) await ok('PUT', `/bookings/${id}`, { status: 'cancelled' });
    for (let n = 20; n <= 22; n++) await ok('POST', '/bookings', booking(n));
    for (const n of [1, 2]) {   // two laptops: booked, then picked up
        const made = await ok('POST', '/bookings', booking(23 + n, { product_id: productIds[n - 1], product_name: `MacBook ${pad(n)}`, pickup_date: daysFromToday(1) }));
        await ok('POST', `/bookings/${made.id}/pickup`, { warranty: '1_week' });
    }
    await ok('POST', '/bookings', booking(25, { product_id: productIds[12], product_name: 'Dell XPS 01', pickup_date: daysFromToday(2) }));   // booked: that laptop is set aside

    // ----- 25 repairs: 15 received, 6 fixed, 4 picked up -----
    const repairIds: number[] = [];
    for (let n = 1; n <= 25; n++) {
        repairIds.push((await ok('POST', '/repairs', {
            device: `Laptop R${pad(n)}`, problem: `Problem ${pad(n)}`, received_date: daysFromToday(-n),
            ...(n === 3 ? { customer_name: 'Vanna Chea', phone: '099 (111) 222' } : {})
        })).id);
    }
    for (const id of repairIds.slice(15, 21)) await ok('PUT', `/repairs/${id}`, { status: 'fixed' });
    for (const id of repairIds.slice(21)) await ok('PUT', `/repairs/${id}`, { status: 'picked_up' });

    // ----- invoices: sales of every age and warranty, plus a booking paper and a repair paper -----
    const sale = async (n: number, daysAgo: number, warranty: string, extra: Record<string, unknown> = {}) => {
        const date = daysFromToday(-daysAgo);
        const made = await ok('POST', '/invoices', { type: 'sale', invoice_date: date, warranty, items: [{ name: `Sale item ${pad(n)}`, qty: 1, unit_price: 100 + n }], ...extra });
        seeded.sales.push({ id: made.id, number: made.number, date, warranty });
        return made;
    };
    let n = 0;
    for (let i = 0; i < 5; i++) await sale(++n, 0, '1_week');
    for (let i = 0; i < 3; i++) await sale(++n, 10, '1_week');          // the week is over
    for (let i = 0; i < 4; i++) await sale(++n, 20, '1_month');         // still under its month
    for (let i = 0; i < 4; i++) await sale(++n, 40, '1_month');         // the month is over
    for (let i = 0; i < 4; i++) await sale(++n, 0, 'none');
    seeded.customerSaleNumber = (await sale(++n, 1, '2_weeks', { phone: '012 345 678', customer_name: 'Sok Lea' })).number;
    await ok('POST', '/invoices', { type: 'booking', pickup_date: daysFromToday(5), items: [{ name: 'Deposit', unit_price: 50 }] });
    await ok('POST', '/invoices', { type: 'repair', device: 'Lenovo', problem: 'No power', items: [{ name: 'Labour', unit_price: 25 }] });
});

after(async () => { if (stop) await stop(); });

// ================================================================== the shape

test('no page in the address: every row, as before (a plain list)', { skip }, async () => {
    for (const [path, expected] of [['/bookings', 25], ['/repairs', 25], ['/products?include_archived=true', 25], ['/users', 2]] as const) {
        const answer = await get(path);
        assert.ok(Array.isArray(answer), path);
        assert.equal(answer.length, expected, path);
    }
});

test('a page: its numbers and its rows, in the shape { page, per_page, total, total_pages, results, meta }', { skip }, async () => {
    const answer = await get('/bookings?page=1&per_page=10');
    assert.deepEqual(Object.keys(answer).sort(), ['meta', 'page', 'per_page', 'results', 'total', 'total_pages']);
    assert.equal(answer.page, 1);
    assert.equal(answer.per_page, 10);
    assert.equal(answer.total, 25);
    assert.equal(answer.total_pages, 3);
    assert.equal(answer.results.length, 10);
});

test('only page or only per_page: the other one gets its default (page 1, 20 a page)', { skip }, async () => {
    const onlyPerPage = await get('/bookings?per_page=5');
    assert.equal(onlyPerPage.page, 1);
    assert.equal(onlyPerPage.results.length, 5);
    const onlyPage = await get('/bookings?page=2');
    assert.equal(onlyPage.per_page, 20);
    assert.equal(onlyPage.results.length, 5);      // 25 bookings: the second page of 20 has 5
});

test('the last page is partial, and a page beyond it is empty with the right total', { skip }, async () => {
    assert.equal((await get('/bookings?page=3&per_page=10')).results.length, 5);
    const beyond = await get('/bookings?page=9&per_page=10');
    assert.deepEqual([beyond.results, beyond.total, beyond.total_pages, beyond.page], [[], 25, 3, 9]);
});

// ================================================================== pages put together are the whole list

test('every list: the pages, read one after the other, are exactly the plain list (same order, no row twice, none missing)', { skip }, async () => {
    for (const path of ['/bookings', '/repairs', '/invoices', '/products?include_archived=true', '/products', '/users']) {
        const whole = ids(await get(path));
        for (const perPage of [1, 7, 10, 100]) {
            const { rows, pages } = await readAllPages(path, perPage);
            assert.deepEqual(ids(rows), whole, `${path} read ${perPage} at a time`);
            assert.equal(new Set(ids(rows)).size, rows.length, `${path}: a row came twice`);
            assert.equal(pages[0].total, whole.length, path);
        }
    }
});

// ================================================================== bookings

test('bookings: the status filter and the exclude filter', { skip }, async () => {
    assert.equal((await get('/bookings?status=booked&page=1&per_page=100')).total, 20);
    assert.equal((await get('/bookings?status=cancelled&page=1&per_page=100')).total, 3);
    assert.equal((await get('/bookings?status=picked_up&page=1&per_page=100')).total, 2);
    assert.equal((await get('/bookings?exclude_status=picked_up&page=1&per_page=100')).total, 23);
    assert.equal((await get('/bookings?status=booked&exclude_status=picked_up&page=1&per_page=100')).total, 20);
});

test('bookings: "everything except picked up" is what the Bookings page shows, and its tab numbers come with it', { skip }, async () => {
    const answer = await get('/bookings?exclude_status=picked_up&page=1&per_page=10');
    assert.equal(answer.total, 23);
    assert.ok(answer.results.every((b: any) => b.status !== 'picked_up'));
    assert.deepEqual(answer.meta, { counts: { booked: 20, picked_up: 2, cancelled: 3 } });
    // the filters work in a plain list too
    assert.equal((await get('/bookings?status=cancelled')).length, 3);
});

test('bookings: the numbers of the tabs are not narrowed by a search', { skip }, async () => {
    const answer = await get('/bookings?search=Booking%2005&page=1&per_page=10');
    assert.equal(answer.total, 1);
    assert.deepEqual(answer.meta.counts, { booked: 20, picked_up: 2, cancelled: 3 });
});

test('bookings: search finds the laptop, the telegram, the phone and the phone by its digits, ignoring capitals', { skip }, async () => {
    const found = async (search: string) => (await get(`/bookings?search=${encodeURIComponent(search)}&page=1&per_page=100`)).results.map((b: any) => b.product_name);
    assert.deepEqual(await found('booking 05'), ['Booking 05']);                  // the laptop, capitals ignored
    assert.deepEqual(await found('@CLIENT07'), ['Booking 07']);                    // the telegram
    assert.deepEqual(await found('+855 11'), ['Booking 05']);                      // the phone as it was typed
    assert.deepEqual(await found('968240'), ['Booking 05']);                       // the phone by its digits
    assert.deepEqual(await found('9 6'), []);                                      // (only 2 digits: not a digits search, and no text has "9 6")
    assert.deepEqual(await found('96 8'), ['Booking 05']);                         // (3 digits: "968" is looked for in the digits of the phone)
    assert.deepEqual(await found('nothing like this'), []);
});

test('bookings: search together with the status and a page: the total is what matches', { skip }, async () => {
    const answer = await get('/bookings?status=booked&search=booking%201&page=1&per_page=3');
    // "booking 1" is in Booking 10 .. 19: 7 are booked (10..16), 3 are cancelled (17..19)
    assert.equal(answer.total, 7);
    assert.equal(answer.results.length, 3);
    assert.equal(answer.total_pages, 3);
});

// ================================================================== repairs

test('repairs: the status filter, the numbers of the tabs, and the search (device, problem, customer, phone by its digits)', { skip }, async () => {
    const received = await get('/repairs?status=received&page=1&per_page=10');
    assert.equal(received.total, 15);
    assert.deepEqual(received.meta.counts, { received: 15, fixed: 6, picked_up: 4 });
    const found = async (search: string) => (await get(`/repairs?search=${encodeURIComponent(search)}&page=1&per_page=100`)).results.map((r: any) => r.device);
    assert.deepEqual(await found('laptop r07'), ['Laptop R07']);
    assert.deepEqual(await found('problem 12'), ['Laptop R12']);
    assert.deepEqual(await found('vanna'), ['Laptop R03']);
    assert.deepEqual(await found('099111'), ['Laptop R03']);                       // "099 (111) 222" by its digits
    assert.equal((await get('/repairs?status=fixed&search=laptop&page=1&per_page=4')).total, 6);
});

// ================================================================== invoices

test('invoices: the type filter, and the pages of one kind', { skip }, async () => {
    const sales = await get('/invoices?type=sale&page=1&per_page=100');
    assert.equal(sales.total, 2 + 21);                                              // 2 from the pickups + 21 made here
    assert.ok(sales.results.every((i: any) => i.type === 'sale'));
    assert.equal((await get('/invoices?type=booking')).length, 1);
    assert.equal((await get('/invoices?type=repair')).length, 1);
});

test('invoices: "this month" and "under warranty" give what the rules say, and the tab numbers agree', { skip }, async () => {
    const all = (await get('/invoices?type=sale')) as { id: number; invoice_date: string; warranty: string }[];
    const month = all.filter(i => thisMonth(i.invoice_date));
    const warranty = all.filter(i => underWarranty(i.invoice_date, i.warranty));
    assert.ok(month.length > 0 && warranty.length > 0 && warranty.length < all.length, 'the data should have both kinds');

    const monthPage = await get('/invoices?type=sale&period=month&page=1&per_page=100');
    assert.deepEqual(ids(monthPage.results).sort(), ids(month).sort());
    const warrantyPage = await get('/invoices?type=sale&period=warranty&page=1&per_page=100');
    assert.deepEqual(ids(warrantyPage.results).sort(), ids(warranty).sort());

    const expected = { all: all.length, month: month.length, warranty: warranty.length };
    assert.deepEqual(monthPage.meta.counts, expected);
    assert.deepEqual(warrantyPage.meta.counts, expected);                           // not narrowed by the period
    assert.deepEqual((await get('/invoices?type=sale&search=sale%20item%2003&page=1&per_page=10')).meta.counts, expected);   // nor by a search
    // the filters work in a plain list too
    assert.deepEqual(ids(await get('/invoices?type=sale&period=warranty')).sort(), ids(warranty).sort());
});

test('invoices: search finds the number (with or without the zeros), the item, the customer and the phone by its digits', { skip }, async () => {
    const found = async (search: string) => (await get(`/invoices?type=sale&search=${encodeURIComponent(search)}&page=1&per_page=100`)).results;
    const n = seeded.customerSaleNumber;
    assert.ok((await found(String(n))).some((i: any) => i.number === n), 'the number');
    assert.ok((await found(String(n).padStart(6, '0'))).some((i: any) => i.number === n), 'the number with its zeros');
    assert.equal((await found('SALE ITEM 07')).length, 1, 'an item, capitals ignored');
    assert.equal((await found('sok lea'))[0].number, n, 'the customer');
    assert.equal((await found('012345678'))[0].number, n, 'the phone by its digits');
    assert.equal((await found('unit_price')).length, 0, 'a word of the data itself is not an item name');
    assert.equal((await found('qty')).length, 0);
});

// ================================================================== products

test('products: the Menu list leaves out sold and set-aside laptops, the Products page asks for everything', { skip }, async () => {
    assert.equal((await get('/products?page=1&per_page=100')).total, 22);           // 25 - 2 sold - 1 set aside
    assert.equal((await get('/products?include_archived=true&page=1&per_page=100')).total, 25);
});

test('products: category, brand and search, together with pages', { skip }, async () => {
    assert.equal((await get(`/products?include_archived=true&category_id=${seeded.macId}&page=1&per_page=100`)).total, 12);
    assert.equal((await get(`/products?include_archived=true&category_id=${seeded.winId}&page=1&per_page=5`)).total, 13);
    assert.equal((await get('/products?include_archived=true&brand=dell&page=1&per_page=5')).total, 13);       // capitals ignored
    assert.equal((await get('/products?include_archived=true&brand=Apple&page=1&per_page=5')).total, 12);
    const xps = await get('/products?include_archived=true&search=xps%201&page=1&per_page=100');
    assert.deepEqual(xps.results.map((p: any) => p.name), ['Dell XPS 10', 'Dell XPS 11', 'Dell XPS 12', 'Dell XPS 13']);
    assert.ok(xps.results.every((p: any) => typeof p.category_name === 'string'), 'every product still says its category');
});

test('products: a % or _ in the search is plain text, not "anything"', { skip }, async () => {
    assert.deepEqual((await get('/products?include_archived=true&search=50%25&page=1&per_page=100')).results.map((p: any) => p.name), ['Promo 50% off']);
    assert.deepEqual((await get('/products?include_archived=true&search=%25&page=1&per_page=100')).results.map((p: any) => p.name), ['Promo 50% off']);
    assert.equal((await get('/products?include_archived=true&search=_&page=1&per_page=100')).total, 0);
});

test('products: the SKU and the code can be searched too', { skip }, async () => {
    const bySku = await get('/products?include_archived=true&search=WIN-DEL-001&page=1&per_page=10');
    assert.deepEqual(bySku.results.map((p: any) => p.name), ['Dell XPS 01']);
    const byCode = await get('/products?include_archived=true&search=LP-0001&page=1&per_page=10');
    assert.deepEqual(byCode.results.map((p: any) => p.name), ['MacBook 01']);
});

// ================================================================== users

test('users: pages of 1', { skip }, async () => {
    const first = await get('/users?page=1&per_page=1');
    const second = await get('/users?page=2&per_page=1');
    assert.deepEqual([first.total, first.total_pages, first.results.length, second.results.length], [2, 2, 1, 1]);
    assert.deepEqual([...ids(first.results), ...ids(second.results)], ids(await get('/users')));
});

// ================================================================== mistakes

test('mistakes in the address are a 400 that says what is wrong', { skip }, async () => {
    const cases: [string, string][] = [
        ['/bookings?page=0', 'page must be a whole number of 1 or more'],
        ['/bookings?page=abc', 'page must be a whole number of 1 or more'],
        ['/bookings?per_page=0', 'per_page must be a whole number from 1 to 100'],
        ['/bookings?per_page=101', 'per_page must be a whole number from 1 to 100'],
        ['/bookings?page=1&page=2', 'page must be a whole number of 1 or more'],
        ['/bookings?status=lost', 'Status must be one of: booked, picked_up, cancelled'],
        ['/bookings?exclude_status=lost', 'exclude_status must be one of: booked, picked_up, cancelled'],
        ['/repairs?status=lost&page=1', 'Status must be one of: received, fixed, picked_up'],
        ['/invoices?type=gift&page=1', 'Type must be sale, booking or repair'],
        ['/invoices?period=week', 'Period must be month or warranty'],
        ['/products?category_id=abc', 'category_id must be a whole number of 1 or more'],
        ['/products?category_id=0', 'category_id must be a whole number of 1 or more'],
        ['/products?brand=a&brand=b', 'brand must be text'],
        [`/bookings?search=${'x'.repeat(101)}`, 'search is too long (max 100 characters)'],
        ['/bookings?search=a&search=b', 'search must be text'],
        ['/users?page=-1', 'page must be a whole number of 1 or more']
    ];
    for (const [path, message] of cases) {
        const answer = await api('GET', path);
        assert.equal(answer.status, 400, path);
        assert.equal(answer.body.error, message, path);
    }
});

test('a page of a list needs the same sign-in as the list', { skip }, async () => {
    const saved = token;
    token = '';
    for (const path of ['/bookings?page=1', '/repairs?page=1', '/invoices?page=1', '/products?page=1', '/users?page=1']) {
        assert.equal((await api('GET', path)).status, 401, path);
    }
    token = saved;
});
