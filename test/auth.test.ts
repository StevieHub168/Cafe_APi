import './helpers/env';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { AuthController } from '../src/controllers/auth.controller';
import { requireAdmin, requireAuth } from '../src/middleware/auth.middleware';
import { UserRepository } from '../src/repositories/user.repository';
import { AppError } from '../src/errors/app-error';
import { AuthService } from '../src/services/auth.service';

// ---------- helpers ----------

const tokenFor = (userId: number, options: jwt.SignOptions = {}) => jwt.sign({ userId }, 'test-secret', options);
const reply = () => {
    const res = { statusCode: 0, body: null as unknown, status(code: number) { res.statusCode = code; return res; }, json(body: unknown) { res.body = body; return res; } };
    return res;
};
// What happens when a handler throws: the error, or null when it finished.
const errorOf = async (run: () => unknown): Promise<AppError | null> => {
    try { await run(); return null; } catch (error) { return error as AppError; }
};
const asRequest = (value: unknown) => value as Request;
const never = (() => {}) as NextFunction;

// The database is replaced for each test: nothing here touches MySQL.
const restorers: (() => void)[] = [];
function stub(target: object, name: string, fake: unknown): void {
    const holder = target as Record<string, unknown>;
    const original = holder[name];
    holder[name] = fake;
    restorers.push(() => { holder[name] = original; });
}
afterEach(() => { while (restorers.length) restorers.pop()!(); });

const signedInUser = { username: 'owner', email: 'owner@shop.com', full_name: 'Owner', role: 'admin' };

// ---------- the token check ----------

test('no token: 401', async () => {
    const error = await errorOf(() => requireAuth(asRequest({ headers: {} }), {} as Response, never));
    assert.equal(error?.statusCode, 401);
    assert.equal(error?.message, 'No token provided');
});

test('a header that is not "Bearer <token>": 401', async () => {
    const error = await errorOf(() => requireAuth(asRequest({ headers: { authorization: 'Basic abc' } }), {} as Response, never));
    assert.equal(error?.message, 'No token provided');
});

test('a token with a wrong signature: 401 "Invalid token"', async () => {
    const forged = jwt.sign({ userId: 1 }, 'another-secret');
    const error = await errorOf(() => requireAuth(asRequest({ headers: { authorization: `Bearer ${forged}` } }), {} as Response, never));
    assert.equal(error?.statusCode, 401);
    assert.equal(error?.message, 'Invalid token');
});

test('a token that ran out: 401 "Token expired"', async () => {
    const old = tokenFor(1, { expiresIn: -10 });
    const error = await errorOf(() => requireAuth(asRequest({ headers: { authorization: `Bearer ${old}` } }), {} as Response, never));
    assert.equal(error?.statusCode, 401);
    assert.equal(error?.message, 'Token expired');
});

test('a good token that is no longer the saved one (after a logout): 401', async () => {
    stub(UserRepository, 'findByAccessToken', async () => undefined);
    const error = await errorOf(() => requireAuth(asRequest({ headers: { authorization: `Bearer ${tokenFor(1)}` } }), {} as Response, never));
    assert.equal(error?.statusCode, 401);
    assert.match(error?.message ?? '', /invalidated/);
});

test('a good token that is the saved one: the user is put on the request and the request goes on', async () => {
    const token = tokenFor(7);
    stub(UserRepository, 'findByAccessToken', async (given: string) => (given === token ? signedInUser : undefined));
    const req = asRequest({ headers: { authorization: `Bearer ${token}` } });
    let went = false;
    await requireAuth(req, {} as Response, (() => { went = true; }) as NextFunction);
    assert.ok(went);
    assert.deepEqual(req.user, { userId: 7, token, username: 'owner', email: 'owner@shop.com', fullName: 'Owner', role: 'admin' });
});

test('when the database is down the answer is NOT "invalid token": the error goes on as it is (a 500 for the handler)', async () => {
    stub(UserRepository, 'findByAccessToken', async () => { throw new Error('connect ECONNREFUSED'); });
    const error = await errorOf(() => requireAuth(asRequest({ headers: { authorization: `Bearer ${tokenFor(1)}` } }), {} as Response, never));
    assert.equal(error?.message, 'connect ECONNREFUSED');
    assert.equal(error?.statusCode, undefined);
});

test('requireAdmin: an admin goes on, staff get 403', () => {
    let went = false;
    requireAdmin(asRequest({ user: { role: 'admin' } }), {} as Response, (() => { went = true; }) as NextFunction);
    assert.ok(went);

    assert.throws(() => requireAdmin(asRequest({ user: { role: 'staff' } }), {} as Response, never), (error: AppError) => error.statusCode === 403);
    assert.throws(() => requireAdmin(asRequest({}), {} as Response, never), (error: AppError) => error.statusCode === 403);
});

// ---------- logout ----------

test('logout throws the saved token away, so it stops working at once', async () => {
    let deletedFor: number | null = null;
    stub(UserRepository, 'deleteAccessToken', async (id: number) => { deletedFor = id; });
    assert.deepEqual(await AuthService.logout(7), { message: 'Logged out successfully' });
    assert.equal(deletedFor, 7);
});

test('POST /auth/logout really calls it, for the user who asked', async () => {
    let loggedOut: number | null = null;
    stub(AuthService, 'logout', async (id: number) => { loggedOut = id; return { message: 'Logged out successfully' }; });
    const res = reply();
    await AuthController.logout(asRequest({ user: { userId: 7 } }), res as unknown as Response);
    assert.equal(loggedOut, 7);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'Logged out successfully' });
});

// ---------- signing in ----------

test('login: a missing email or password is a 400', async () => {
    assert.equal((await errorOf(() => AuthController.login(asRequest({ body: { email: 'a@b.com' } }), reply() as unknown as Response)))?.statusCode, 400);
    assert.equal((await errorOf(() => AuthController.login(asRequest({ body: undefined }), reply() as unknown as Response)))?.statusCode, 400);
});

test('login: an unknown email and a wrong password both give the same 401 (nobody can tell which email exists)', async () => {
    const hash = await bcrypt.hash('right-password', 4);
    stub(UserRepository, 'findByEmail', async (email: string) => (email === 'owner@shop.com' ? { id: 1, password: hash } : undefined));

    const unknown = await errorOf(() => AuthService.login('nobody@shop.com', 'whatever'));
    const wrong = await errorOf(() => AuthService.login('owner@shop.com', 'wrong-password'));
    for (const error of [unknown, wrong]) {
        assert.equal(error?.statusCode, 401);
        assert.equal(error?.message, 'Invalid email or password');
    }
});

test('login: the right password gives a token that is saved, signed with the secret, and no password in the answer', async () => {
    let savedToken: { id: number; token: string } | null = null;
    const hash = await bcrypt.hash('right-password', 4);
    stub(UserRepository, 'findByEmail', async () => ({ id: 1, password: hash }));
    stub(UserRepository, 'saveAccessToken', async (id: number, token: string) => { savedToken = { id, token }; });
    stub(UserRepository, 'findById', async () => signedInUser);

    const result = await AuthService.login('owner@shop.com', 'right-password');
    assert.deepEqual(result.user, signedInUser as never);
    assert.equal(result.token, (savedToken as unknown as { token: string }).token);
    assert.equal((jwt.verify(result.token, 'test-secret') as { userId: number }).userId, 1);
    const decoded = jwt.decode(result.token) as { exp: number; iat: number };
    assert.equal(decoded.exp - decoded.iat, 24 * 60 * 60);
});

test('a missing user is a 404, a taken email or username is a 409', async () => {
    stub(UserRepository, 'findById', async () => undefined);
    assert.equal((await errorOf(() => AuthService.getUserById(99)))?.statusCode, 404);
    assert.equal((await errorOf(() => AuthService.resetPassword('99', 'long-enough-password', 1)))?.statusCode, 404);

    stub(UserRepository, 'findByEmail', async () => ({ id: 1 }));
    assert.equal((await errorOf(() => AuthService.createUser('x', 'taken@shop.com', 'long-enough-1', 'X')))?.statusCode, 409);
});

test('resetPassword: a short password is a 400', async () => {
    stub(UserRepository, 'findById', async () => signedInUser);
    const error = await errorOf(() => AuthService.resetPassword('1', 'short', 1));
    assert.equal(error?.statusCode, 400);
    assert.match(error?.message ?? '', /at least 8 characters/);
});

test('register: a role that does not exist is a 400 (not a database error)', async () => {
    const error = await errorOf(() => AuthService.register({ username: 'x', email: 'x@shop.com', password: 'long-enough-1', role: 'superuser' }));
    assert.equal(error?.statusCode, 400);
    assert.equal(error?.message, 'Role must be one of: admin, staff');
});

// ---------- a new member ----------

/** The database for adding a member: these usernames are taken; what is saved is kept in `saved`. */
function memberDatabase(takenUsernames: string[] = []) {
    const saved: unknown[] = [];
    stub(UserRepository, 'findByEmail', async () => undefined);
    stub(UserRepository, 'findByUsername', async (name: string) => (takenUsernames.includes(name) ? { id: 1 } : undefined));
    stub(UserRepository, 'create', async (...args: unknown[]) => { saved.push(...args); return 7; });
    stub(UserRepository, 'findById', async () => ({ id: 7, username: saved[0], email: saved[1], full_name: saved[3], role: saved[4] }));
    stub(UserRepository, 'saveAccessToken', async () => undefined);
    return saved;
}

test('register: no username is needed, it is made from the email (and the name from the username)', async () => {
    const saved = memberDatabase();
    const { user } = await AuthService.register({ email: ' Mony@Gmail.com ', password: 'Thastore@1234' });
    assert.equal(saved[0], 'mony');                       // the part before the @, small letters
    assert.equal(saved[1], 'Mony@Gmail.com');             // the spaces are cut off
    assert.equal(saved[3], 'mony');                       // no name written: the username
    assert.equal(saved[4], 'staff');
    assert.equal(user.username, 'mony');
});

test('register: a username that someone has gets a number after it', async () => {
    const saved = memberDatabase(['admin', 'admin2']);
    await AuthService.register({ email: 'admin@gmail.com', password: 'Leap@1234', role: 'admin', full_name: 'Shop Admin' });
    assert.equal(saved[0], 'admin3');
    assert.equal(saved[3], 'Shop Admin');
    assert.equal(saved[4], 'admin');
});

test('register: a username that is written and taken is still a 409 (it is not changed behind the back)', async () => {
    memberDatabase(['newbie']);
    const error = await errorOf(() => AuthService.register({ username: 'newbie', email: 'n@shop.com', password: 'long-enough-1' }));
    assert.equal(error?.statusCode, 409);
    assert.equal(error?.message, 'Username already taken');
});

test('register: an email that is not an email, a short password or a missing one is a 400 with a plain message', async () => {
    memberDatabase();
    const bad = async (data: Record<string, unknown>) => errorOf(() => AuthService.register(data));
    assert.equal((await bad({ email: 'not-an-email', password: 'long-enough-1' }))?.message, 'Write a real email, like name@shop.com');
    assert.equal((await bad({ email: 'a@b', password: 'long-enough-1' }))?.statusCode, 400);
    assert.equal((await bad({ email: 'a@shop.com', password: 'short' }))?.message, 'The password must be at least 8 characters');
    assert.equal((await bad({ email: 'a@shop.com', password: '        ' }))?.message, 'Write the password');
    assert.match((await bad({ email: 'a@shop.com', password: 'x'.repeat(80) }))?.message ?? '', /too long/);
});

test('register: the controller needs an email and a password (the username is optional now)', async () => {
    const res = reply();
    const error = await errorOf(() => AuthController.register(asRequest({ body: { username: 'x' } }), res as unknown as Response));
    assert.equal(error?.statusCode, 400);
    assert.equal(error?.message, 'Email and password are required');
});
