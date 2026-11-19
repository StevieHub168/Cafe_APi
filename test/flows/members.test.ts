// Adding a member through the real HTTP API against a THROWAWAY database: only an admin can, no username is needed, the new member can sign in.
//   TEST_DB_NAME=laptop_repair_test npm test
/* eslint-disable @typescript-eslint/no-explicit-any */
import '../helpers/env';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFlowServer } from './harness';

const TEST_DB = process.env.TEST_DB_NAME;
const skip = TEST_DB ? false : 'set TEST_DB_NAME (a throwaway database, e.g. laptop_repair_test) to run the members test';

let base = '';
let stop: (() => Promise<void>) | undefined;
let adminToken = '';
let staffToken = '';

const api = async (method: string, path: string, token: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
};
const login = async (email: string, password: string) => api('POST', '/auth/login', '', { email, password });

before(async () => {
    if (!TEST_DB) return;
    ({ base, stop } = await startFlowServer(TEST_DB));
    adminToken = (await login('owner@test.local', 'Admin-pass-1')).body.token;
    staffToken = (await login('helper@test.local', 'Staff-pass-1')).body.token;
});
after(async () => { if (stop) await stop(); });

test('an admin adds a staff member with only an email and a password: the username and the name come from the email, and they can sign in', { skip }, async () => {
    const added = await api('POST', '/auth/register', adminToken, { email: 'mony@gmail.com', password: 'Thastore@1234' });
    assert.equal(added.status, 201);
    assert.equal(added.body.user.username, 'mony');
    assert.equal(added.body.user.full_name, 'mony');
    assert.equal(added.body.user.role, 'staff');

    const signedIn = await login('mony@gmail.com', 'Thastore@1234');
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.user.email, 'mony@gmail.com');
});

test('a name and the role admin can be written, and the new member shows in the users list', { skip }, async () => {
    const added = await api('POST', '/auth/register', adminToken, { email: 'boss@gmail.com', password: 'Leap@1234', full_name: 'The Boss', role: 'admin' });
    assert.equal(added.status, 201);
    assert.equal(added.body.user.full_name, 'The Boss');
    assert.equal(added.body.user.role, 'admin');
    assert.equal((await login('boss@gmail.com', 'Leap@1234')).status, 200);

    const list = await api('GET', '/users', adminToken);
    assert.ok(list.body.some((user: any) => user.email === 'boss@gmail.com' && user.role === 'admin'));
});

test('a username that someone already has gets a number (the email "owner@x.com" is not the owner, but the username "owner" is taken)', { skip }, async () => {
    const first = await api('POST', '/auth/register', adminToken, { email: 'owner@other.com', password: 'Thastore@1234' });
    assert.equal(first.body.user.username, 'owner2');
    const second = await api('POST', '/auth/register', adminToken, { email: 'owner@third.com', password: 'Thastore@1234' });
    assert.equal(second.body.user.username, 'owner3');
});

test('the same email twice is a 409, and a short password or a bad email is a 400 with a plain message', { skip }, async () => {
    assert.equal((await api('POST', '/auth/register', adminToken, { email: 'mony@gmail.com', password: 'Thastore@1234' })).status, 409);
    const short = await api('POST', '/auth/register', adminToken, { email: 'new1@gmail.com', password: 'short' });
    assert.equal(short.status, 400);
    assert.equal(short.body.error, 'The password must be at least 8 characters');
    const bad = await api('POST', '/auth/register', adminToken, { email: 'nobody', password: 'Thastore@1234' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'Write a real email, like name@shop.com');
    assert.equal((await api('POST', '/auth/register', adminToken, { email: 'new2@gmail.com' })).body.error, 'Email and password are required');
});

test('only an admin can add a member (staff are refused, and nobody signed out is let in)', { skip }, async () => {
    assert.equal((await api('POST', '/auth/register', staffToken, { email: 'sneaky@gmail.com', password: 'Thastore@1234' })).status, 403);
    assert.equal((await api('POST', '/auth/register', '', { email: 'sneaky@gmail.com', password: 'Thastore@1234' })).status, 401);
    assert.equal((await login('sneaky@gmail.com', 'Thastore@1234')).status, 401);        // nothing was made
});
