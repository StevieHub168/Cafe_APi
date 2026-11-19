// What the flow test needs: a throwaway database, the "call" helper and the way answers are written down.
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

export interface Step { label: string; method: string; path: string; status: number; body: unknown }

const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

/** Times, tokens and "today" change from run to run: they are hidden, so two runs can be compared. */
export function clean(value: unknown, key?: string): unknown {
    if (Array.isArray(value)) return value.map(item => clean(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
    if (key === 'created_at' || key === 'updated_at') return value === null ? null : '<time>';
    if (key === 'token') return '<token>';
    if (typeof value === 'string' && value === today) return '<today>';
    return value;
}

const connect = (database?: string) => mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database, multipleStatements: true, dateStrings: true
});

/** Drops and makes the throwaway database again from schema.sql, with two users (owner = admin, helper = staff). Never the shop's own database. */
export async function resetTestDatabase(name: string): Promise<void> {
    if (!/_test$/.test(name)) throw new Error(`"${name}" does not end with _test: the flow test only works on a throwaway database.`);
    if (name === process.env.DB_REAL_NAME) throw new Error('That is the shop\'s own database.');
    const conn = await connect();
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${name}\``);
    const schema = fs.readFileSync(path.resolve(__dirname, '../../schema.sql'), 'utf8').replace(/CREATE DATABASE[^;]*;/i, '').replace(/USE [^;]*;/i, '');
    await conn.query(schema);
    const admin = await bcrypt.hash('Admin-pass-1', 4);
    const staff = await bcrypt.hash('Staff-pass-1', 4);
    await conn.query("INSERT INTO users (username, email, password, full_name, role) VALUES ('owner', 'owner@test.local', ?, 'The Owner', 'admin'), ('helper', 'helper@test.local', ?, 'The Helper', 'staff')", [admin, staff]);
    await conn.end();
}

/**
 * Makes the throwaway database, and starts the real app on a free port, in this process. Telegram is switched off (nothing is ever sent)
 * and uploads go to a temporary folder. The code reads the settings when it is loaded, so they are set before it is.
 */
export async function startFlowServer(testDb: string): Promise<{ base: string; stop: () => Promise<void> }> {
    process.env.DB_REAL_NAME = process.env.DB_NAME;
    process.env.DB_NAME = testDb;
    for (const key of ['TELEGRAM_ADMIN_USER_ID', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_REPAIR_BOT_TOKEN', 'TELEGRAM_REPAIR_CHAT_ID',
        'TELEGRAM_SOLD_BOT_TOKEN', 'TELEGRAM_SOLD_CHAT_ID', 'TELEGRAM_BOOKING_BOT_TOKEN', 'TELEGRAM_BOOKING_CHAT_ID', 'PUBLIC_APP_URL']) process.env[key] = '';
    process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flows-uploads-'));
    await resetTestDatabase(testDb);

    const { default: app } = await import('../../src/app');
    const { sequelize } = await import('../../src/database/database');
    const server = await new Promise<Server>(resolve => { const listening = app.listen(0, () => resolve(listening)); });
    return {
        base: `http://localhost:${(server.address() as AddressInfo).port}/api`,
        stop: async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); }
    };
}

/** What is stored at the end: every row of every table (times hidden, passwords and tokens hidden). */
export async function dumpState(name: string): Promise<Record<string, unknown[]>> {
    const conn = await connect(name);
    const state: Record<string, unknown[]> = {};
    for (const table of ['users', 'categories', 'products', 'bookings', 'repairs', 'invoices']) {
        const [rows] = await conn.query(`SELECT * FROM ${table} ORDER BY id`);
        state[table] = (rows as Record<string, unknown>[]).map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [
            k, k === 'created_at' || k === 'updated_at' ? '<time>' : k === 'password' ? '<hash>' : k === 'access_token' ? (v ? '<token>' : null) : v
        ])));
    }
    await conn.end();
    return state;
}
