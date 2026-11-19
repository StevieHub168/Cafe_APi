import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, badRequest, conflict, forbidden, notFound, tooManyRequests, unauthorized } from '../src/errors/app-error';

test('each helper makes an AppError with its own status', () => {
    const cases: [AppError, number][] = [
        [badRequest('Full price must be more than 0'), 400],
        [unauthorized('Invalid token'), 401],
        [forbidden('Admin access required'), 403],
        [notFound('Booking'), 404],
        [conflict('This laptop is already booked'), 409],
        [tooManyRequests('Too many tries'), 429]
    ];
    for (const [error, status] of cases) {
        assert.ok(error instanceof AppError);
        assert.ok(error instanceof Error);
        assert.equal(error.statusCode, status);
    }
});

test('notFound writes "<what> not found"', () => {
    assert.equal(notFound('Booking').message, 'Booking not found');
});

test('unauthorized and forbidden have a plain default message', () => {
    assert.equal(unauthorized().message, 'Please sign in');
    assert.equal(forbidden().message, 'You are not allowed to do this');
});
