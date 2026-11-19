import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const CONFIG = require.resolve('../src/config/auth.config');
const saved = { secret: process.env.JWT_SECRET, expire: process.env.JWT_EXPIRE };

const load = () => {
    delete require.cache[CONFIG];
    return require(CONFIG);
};

afterEach(() => {
    delete require.cache[CONFIG];
    if (saved.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.secret;
    if (saved.expire === undefined) delete process.env.JWT_EXPIRE; else process.env.JWT_EXPIRE = saved.expire;
});

test('the server refuses to start without a JWT_SECRET (no fallback secret)', () => {
    delete process.env.JWT_SECRET;
    assert.throws(load, /JWT_SECRET is missing in the \.env file/);
});

test('a secret of only spaces counts as missing', () => {
    process.env.JWT_SECRET = '   ';
    assert.throws(load, /JWT_SECRET is missing/);
});

test('reads the secret, and a token lasts 24 hours unless JWT_EXPIRE says otherwise', () => {
    process.env.JWT_SECRET = 'a-long-test-secret';
    delete process.env.JWT_EXPIRE;
    assert.deepEqual({ ...load() }, { JWT_SECRET: 'a-long-test-secret', JWT_EXPIRE: '24h' });

    process.env.JWT_EXPIRE = '2h';
    assert.equal(load().JWT_EXPIRE, '2h');
});
