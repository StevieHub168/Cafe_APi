// The whole shop in 243 steps through the real HTTP API (sign in, categories and brands, products, bookings, repairs, invoices,
// and every mistake a person can make), against a THROWAWAY database. Every answer and everything stored must be the same as
// the snapshot in golden.json (what the original JavaScript API answered). So a refactor can be proven not to change a thing.
//
//   TEST_DB_NAME=laptop_repair_test npm test              run it (the database is dropped and made again: use a throwaway one)
//   TEST_DB_NAME=laptop_repair_test UPDATE_GOLDEN=1 npm test   write a new snapshot, when an answer was changed ON PURPOSE
import '../helpers/env';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Step, clean, dumpState, startFlowServer } from './harness';
import { Call, Context, scenario } from './scenario';

const TEST_DB = process.env.TEST_DB_NAME;
const GOLDEN = path.resolve(__dirname, 'golden.json');

let stop: (() => Promise<void>) | undefined;
let base = '';

before(async () => {
    if (!TEST_DB) return;
    ({ base, stop } = await startFlowServer(TEST_DB));
});

after(async () => { if (stop) await stop(); });

test('every answer and everything stored is the same as the snapshot', { skip: TEST_DB ? false : 'set TEST_DB_NAME (a throwaway database, e.g. laptop_repair_test) to run the flow test', timeout: 120000 }, async () => {
    const answers: Step[] = [];
    const ctx: Context = { tokens: {}, ids: {} };
    const call: Call = async (label, method, pathname, { token, body } = {}) => {
        const response = await fetch(base + pathname, {
            method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await response.text();
        let json: any;   // eslint-disable-line @typescript-eslint/no-explicit-any
        try { json = JSON.parse(text); } catch { json = text; }
        answers.push({ label, method, path: pathname, status: response.status, body: clean(json) });
        return { status: response.status, body: json };
    };
    // The first two steps sign in; the rest of the scenario uses the tokens.
    await scenario(call, ctx);
    const state = await dumpState(TEST_DB!);

    if (process.env.UPDATE_GOLDEN) {
        fs.writeFileSync(GOLDEN, JSON.stringify({ answers, db: state }, null, 1));
        console.log(`golden.json written (${answers.length} steps)`);
        return;
    }
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as { answers: Step[]; db: unknown };
    assert.equal(answers.length, golden.answers.length, 'the number of steps');
    answers.forEach((step, i) => assert.deepStrictEqual(step, golden.answers[i], `step ${i + 1}: ${golden.answers[i].label}`));
    assert.deepStrictEqual(state, golden.db, 'what is stored in the database');
});
