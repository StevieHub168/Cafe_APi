import './helpers/env';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// The real app (all routes and middleware). These requests are all turned away before the database is needed.
import app from '../src/app';

let server: Server;
let base: string;
before(async () => {
    await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
});

const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
};

test('every page of the API is behind the sign-in', async () => {
    const paths = ['/api/products', '/api/bookings', '/api/repairs', '/api/invoices', '/api/categories', '/api/telegram/status', '/api/config', '/api/auth/me'];
    for (const path of paths) {
        assert.deepEqual(await call('GET', path), { status: 401, body: { error: 'No token provided' } }, path);
    }
    assert.equal((await call('DELETE', '/api/products/1')).status, 401);
    assert.equal((await call('POST', '/api/auth/logout')).status, 401);
});

test('the users pages are for signed-in admins only: a bad token never gets in', async () => {
    const response = await fetch(`${base}/api/users`, { headers: { Authorization: 'Bearer not-a-real-token' } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid token' });
});

test('login with a field missing is a 400', async () => {
    assert.deepEqual(await call('POST', '/api/auth/login', { email: 'a@b.com' }), { status: 400, body: { error: 'Email and password are required' } });
    assert.equal((await call('POST', '/api/auth/telegram-login', {})).status, 400);
});

test('a path that does not exist is a JSON 404', async () => {
    assert.deepEqual(await call('GET', '/api/nothing'), { status: 404, body: { error: 'Not found' } });
});

test('the API does not say which software it runs on', async () => {
    const response = await fetch(`${base}/api/nothing`);
    assert.equal(response.headers.get('x-powered-by'), null);
});
