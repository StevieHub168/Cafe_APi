import './helpers/env';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { SOMETHING_WRONG, errorHandler, notFoundHandler } from '../src/middleware/error-handler.middleware';
import { badRequest, conflict, notFound } from '../src/errors/app-error';

// A small server with the real error handler and one route for each kind of error.
const app = express();
app.use(express.json({ limit: '1kb' }));
app.get('/bad', async () => { throw badRequest('Full price must be more than 0'); });
app.get('/missing', async () => { throw notFound('Booking'); });
app.get('/conflict', async () => { throw conflict('This laptop is already booked'); });
app.get('/database', async () => {
    throw Object.assign(new Error("ER_BAD_FIELD_ERROR: Unknown column 'secret_column' in 'field list'"), { sqlMessage: 'Unknown column secret_column', code: 'ER_BAD_FIELD_ERROR' });
});
app.get('/bug', () => { (null as unknown as { name: string }).name; });
app.post('/echo', (req, res) => { res.json(req.body); });
app.use(notFoundHandler);
app.use(errorHandler);

let server: Server;
let base: string;
const originalConsoleError = console.error;

before(async () => {
    console.error = () => {};          // the handler logs unexpected errors; keep the test output clean
    await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    console.error = originalConsoleError;
    await new Promise(resolve => server.close(resolve));
});

const get = async (path: string) => {
    const response = await fetch(base + path);
    return { status: response.status, body: await response.json() };
};

test('an AppError is sent with its message and status', async () => {
    assert.deepEqual(await get('/bad'), { status: 400, body: { error: 'Full price must be more than 0' } });
    assert.deepEqual(await get('/missing'), { status: 404, body: { error: 'Booking not found' } });
    assert.deepEqual(await get('/conflict'), { status: 409, body: { error: 'This laptop is already booked' } });
});

test('a database error or a bug is a 500 with a general message, never its own text', async () => {
    for (const path of ['/database', '/bug']) {
        const { status, body } = await get(path);
        assert.equal(status, 500, path);
        assert.deepEqual(body, { error: SOMETHING_WRONG }, path);
    }
});

test('an unexpected error is written to the log with its route', async () => {
    const lines: string[] = [];
    console.error = (text: unknown) => { lines.push(String(text)); };
    await get('/database');
    console.error = () => {};
    assert.ok(lines.some(line => line.includes('GET /database') && line.includes('secret_column')));
});

test('a path that does not exist is a JSON 404', async () => {
    assert.deepEqual(await get('/nothing-here'), { status: 404, body: { error: 'Not found' } });
});

test('JSON that is not valid is a 400, and a body that is too big is a 413', async () => {
    const broken = await fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":' });
    assert.equal(broken.status, 400);
    assert.equal(typeof ((await broken.json()) as { error: unknown }).error, 'string');

    const big = await fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(5000) }) });
    assert.equal(big.status, 413);
});

test('when the answer was already started, the error is passed on (Express closes the connection)', () => {
    let passed: unknown = null;
    const error = new Error('late');
    errorHandler(error, { method: 'GET', originalUrl: '/' } as Request, { headersSent: true } as Response, ((value?: unknown) => { passed = value; }) as NextFunction);
    assert.equal(passed, error);
});
