import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { JWT_EXPIRE, JWT_SECRET } from '../config/auth.config';
import { Role } from '../enums/role.enum';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../errors/app-error';
import { UserRepository, UserSummary } from '../repositories/user.repository';
import { Page, PageRequest, toPage } from '../utils/pagination';
import { Body } from '../utils/types';

const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72;      // bcrypt only reads the first 72 bytes
const MAX_EMAIL = 100;              // the length of the email column
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a password must be: written, long enough, not longer than bcrypt reads. (A new member and a reset follow the same rules.) */
function checkPassword(password: unknown, empty: string): asserts password is string {
    if (typeof password !== 'string' || password.trim() === '') throw badRequest(empty);
    if (password.length < MIN_PASSWORD) throw badRequest(`The password must be at least ${MIN_PASSWORD} characters`);
    if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) throw badRequest(`The password is too long (max ${MAX_PASSWORD_BYTES} characters)`);
}

interface TelegramUser { id: number | string }

export class AuthService {
    // A new member. The username and the name are optional: without a username it is made from the email ("mony@x.com" -> "mony",
    // and "mony2" when that is taken), and without a name the username is used. Signing in is by email.
    static async createUser(username: string | undefined, email: string, password: string, fullName: string | undefined, role: Role = Role.STAFF, phone: string | null = null): Promise<UserSummary | undefined> {
        const cleanEmail = typeof email === 'string' ? email.trim() : '';
        if (!EMAIL_PATTERN.test(cleanEmail)) throw badRequest('Write a real email, like name@shop.com');
        if (cleanEmail.length > MAX_EMAIL) throw badRequest('The email is too long');
        checkPassword(password, 'Write the password');

        const existingUserByEmail = await UserRepository.findByEmail(cleanEmail);
        if (existingUserByEmail) {
            throw conflict('Email already registered');
        }

        const wantedUsername = typeof username === 'string' ? username.trim() : '';
        if (wantedUsername && await UserRepository.findByUsername(wantedUsername)) {
            throw conflict('Username already taken');
        }
        const finalUsername = wantedUsername || await AuthService.freeUsername(cleanEmail);

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = await UserRepository.create(finalUsername, cleanEmail, hashedPassword, (typeof fullName === 'string' && fullName.trim()) || finalUsername, role, phone);
        return UserRepository.findById(userId);
    }

    // The part of the email before the @ (letters and digits only), with a number after it when someone already has it.
    private static async freeUsername(email: string): Promise<string> {
        const base = (email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user').slice(0, 40);
        let name = base;
        for (let n = 2; await UserRepository.findByUsername(name); n++) name = `${base}${n}`;
        return name;
    }

    static async register(data: Body): Promise<{ user: UserSummary; token: string }> {
        const { username, email, password, full_name, role, phone } = data;
        const wantedRole = role || Role.STAFF;
        if (!Object.values(Role).includes(wantedRole)) throw badRequest(`Role must be one of: ${Object.values(Role).join(', ')}`);
        const user = (await AuthService.createUser(username, email, password, full_name, wantedRole, phone)) as UserSummary;
        const token = AuthService.generateToken(user.id);
        await UserRepository.saveAccessToken(user.id, token);
        return { user, token };
    }

    // Login user
    static async login(email: string, password: string): Promise<{ user: UserSummary; token: string }> {
        // Find user
        const user = await UserRepository.findByEmail(email);
        if (!user) {
            throw unauthorized('Invalid email or password');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            throw unauthorized('Invalid email or password');
        }

        // Generate token
        const token = AuthService.generateToken(user.id);

        // Save token to database
        await UserRepository.saveAccessToken(user.id, token);

        // Return a sanitized user record without password/access_token fields.
        const safeUser = (await UserRepository.findById(user.id)) as UserSummary;
        return { user: safeUser, token };
    }

    // Everyone who can sign in (never the passwords).
    static async listUsers(): Promise<UserSummary[]> {
        return UserRepository.findAll();
    }

    // One page of the same list.
    static async listUsersPage(page: PageRequest): Promise<Page<UserSummary>> {
        const { rows, total } = await UserRepository.findPage(page);
        return toPage(page, total, rows);
    }

    // An admin sets a new password for a user. That user is signed out (they must sign in again with the new one).
    // An admin changing their OWN password stays signed in.
    static async resetPassword(userId: string, password: unknown, adminId: number): Promise<{ message: string }> {
        const id = Number(userId);
        const user = Number.isInteger(id) && id > 0 ? await UserRepository.findById(id) : null;
        if (!user) throw notFound('User');

        checkPassword(password, 'Write the new password');

        await UserRepository.updatePassword(id, await bcrypt.hash(password, 10));
        if (id !== Number(adminId)) await UserRepository.deleteAccessToken(id);
        return { message: 'Password changed' };
    }

    // Get user by ID
    static async getUserById(userId: number | string): Promise<UserSummary> {
        const user = await UserRepository.findById(userId);
        if (!user) {
            throw notFound('User');
        }
        return user;
    }

    // Logout user (invalidate token)
    static async logout(userId: number): Promise<{ message: string }> {
        await UserRepository.deleteAccessToken(userId);
        return { message: 'Logged out successfully' };
    }

    // Generate JWT token
    static generateToken(userId: number): string {
        return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE as SignOptions['expiresIn'] });
    }

    // Verify Telegram Mini App initData signature (per Telegram's official validation algorithm)
    // and return the embedded Telegram user, or null if the data is missing, forged, or stale.
    static verifyTelegramInitData(initData: unknown): TelegramUser | null {
        if (!initData || !process.env.TELEGRAM_BOT_TOKEN) {
            return null;
        }

        const params = new URLSearchParams(String(initData));
        const hash = params.get('hash');
        if (!hash) {
            return null;
        }
        params.delete('hash');

        const compareOrdinal = (a: string, b: string) => {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        };
        const dataCheckString = [...params.entries()]
            .map(([key, value]) => `${key}=${value}`)
            .sort(compareOrdinal)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(process.env.TELEGRAM_BOT_TOKEN)
            .digest();
        const computedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (computedHash !== hash) {
            return null;
        }

        // Reject stale init data (replay protection)
        const authDate = Number(params.get('auth_date'));
        const maxAgeSeconds = 24 * 60 * 60;
        if (!authDate || (Date.now() / 1000 - authDate) > maxAgeSeconds) {
            return null;
        }

        try {
            return JSON.parse(params.get('user') || 'null');
        } catch {
            return null;
        }
    }

    // Auto-login the recognized Telegram admin (no password) from verified Telegram initData
    static async telegramLogin(initData: unknown): Promise<{ user: UserSummary; token: string }> {
        const telegramUser = AuthService.verifyTelegramInitData(initData);
        if (!telegramUser) {
            throw unauthorized('Invalid Telegram authentication data');
        }

        const adminTelegramId = process.env.TELEGRAM_ADMIN_USER_ID || process.env.TELEGRAM_CHAT_ID;
        if (!adminTelegramId || String(telegramUser.id) !== String(adminTelegramId)) {
            throw forbidden('Not authorized as admin');
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
        const user = await UserRepository.findByEmail(adminEmail);
        if (!user) {
            throw unauthorized('Admin account not found');
        }

        const token = AuthService.generateToken(user.id);
        await UserRepository.saveAccessToken(user.id, token);
        const safeUser = (await UserRepository.findById(user.id)) as UserSummary;

        return { user: safeUser, token };
    }
}
