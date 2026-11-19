import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../src/errors/app-error';
import { createLoginLimiter } from '../src/middleware/login-limiter.middleware';

const MINUTE = 60 * 1000;

// Runs one sign-in through the limiter: `answerStatus` is what the login would answer. Returns the error given to next(), if any.
function attempt(limiter: ReturnType<typeof createLoginLimiter>, { ip = '1.1.1.1', email = 'owner@shop.com', answerStatus = 401 } = {}): AppError | null {
    const req = { ip, body: { email } } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { statusCode: answerStatus });
    let blocked: AppError | null = null;
    limiter(req, res as unknown as Response, ((error?: unknown) => { blocked = (error as AppError) || null; }) as NextFunction);
    if (!blocked) res.emit('finish');       // the login ran and answered
    return blocked;
}

test('wrong passwords are counted; after the limit the next try is a 429 that says how long to wait', () => {
    const limiter = createLoginLimiter({ maxFailures: 3, windowMs: 15 * MINUTE });
    for (let i = 0; i < 3; i++) assert.equal(attempt(limiter), null);

    const blocked = attempt(limiter);
    assert.equal(blocked?.statusCode, 429);
    assert.equal(blocked?.message, 'Too many tries. Try again in 15 minutes.');
});

test('a right password clears the count', () => {
    const limiter = createLoginLimiter({ maxFailures: 3 });
    attempt(limiter);
    attempt(limiter);
    assert.equal(attempt(limiter, { answerStatus: 200 }), null);
    for (let i = 0; i < 3; i++) assert.equal(attempt(limiter), null);       // a fresh count of 3
    assert.equal(attempt(limiter)?.statusCode, 429);
});

test('another email, or another place, is not blocked', () => {
    const limiter = createLoginLimiter({ maxFailures: 2 });
    attempt(limiter);
    attempt(limiter);
    assert.equal(attempt(limiter)?.statusCode, 429);
    assert.equal(attempt(limiter, { email: 'staff@shop.com' }), null);
    assert.equal(attempt(limiter, { ip: '2.2.2.2' }), null);
});

test('the email is compared without capitals or spaces', () => {
    const limiter = createLoginLimiter({ maxFailures: 2 });
    attempt(limiter, { email: 'Owner@Shop.com' });
    attempt(limiter, { email: ' owner@shop.com ' });
    assert.equal(attempt(limiter, { email: 'OWNER@SHOP.COM' })?.statusCode, 429);
});

test('a request that is wrong in another way (a missing field, a 400) is not counted', () => {
    const limiter = createLoginLimiter({ maxFailures: 2 });
    for (let i = 0; i < 5; i++) assert.equal(attempt(limiter, { answerStatus: 400 }), null);
});

test('the block ends when the time is over', () => {
    let time = 1_000_000;
    const limiter = createLoginLimiter({ maxFailures: 2, windowMs: 15 * MINUTE, now: () => time });
    attempt(limiter);
    attempt(limiter);
    assert.equal(attempt(limiter)?.statusCode, 429);

    time += 10 * MINUTE;
    assert.equal(attempt(limiter)?.message, 'Too many tries. Try again in 5 minutes.');

    time += 5 * MINUTE;
    assert.equal(attempt(limiter), null);
});

test('the last minute is written in the singular', () => {
    let time = 0;
    const limiter = createLoginLimiter({ maxFailures: 1, windowMs: 15 * MINUTE, now: () => time });
    attempt(limiter);
    time += 14.5 * MINUTE;
    assert.equal(attempt(limiter)?.message, 'Too many tries. Try again in 1 minute.');
});
