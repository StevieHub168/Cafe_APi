const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const User = require('../models/User');

class AuthService {
    static async createUser(username, email, password, fullName, role = 'staff', phone = null) {
        const existingUserByEmail = await User.findByEmail(email);
        if (existingUserByEmail) {
            throw new Error('Email already registered');
        }

        const existingUserByUsername = await User.findByUsername(username);
        if (existingUserByUsername) {
            throw new Error('Username already taken');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = await User.create(username, email, hashedPassword, fullName, role, phone);
        return User.findById(userId);
    }

    static async register(data) {
        const { username, email, password, full_name, role, phone } = data;
        const user = await this.createUser(username, email, password, full_name || username, role || 'staff', phone);
        const token = this.generateToken(user.id);
        await User.saveAccessToken(user.id, token);
        return { user, token };
    }

    // Login user
    static async login(email, password) {
        // Find user
        const user = await User.findByEmail(email);
        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            throw new Error('Invalid email or password');
        }

        // Generate token
        const token = this.generateToken(user.id);

        // Save token to database
        await User.saveAccessToken(user.id, token);

        // Return a sanitized user record without password/access_token fields.
        const safeUser = await User.findById(user.id);
        return { user: safeUser, token };
    }

    // Get user by ID
    static async getUserById(userId) {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        return user;
    }

    // Logout user (invalidate token)
    static async logout(userId) {
        await User.deleteAccessToken(userId);
        return { message: 'Logged out successfully' };
    }

    // Verify access token from database
    static async verifyAccessToken(token) {
        const user = await User.findByAccessToken(token);
        if (!user) {
            throw new Error('Invalid or expired token');
        }
        return user;
    }

    // Generate JWT token
    static generateToken(userId) {
        return jwt.sign(
            { userId },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: process.env.JWT_EXPIRE || '24h' }
        );
    }

    // Verify Telegram Mini App initData signature (per Telegram's official validation algorithm)
    // and return the embedded Telegram user, or null if the data is missing, forged, or stale.
    static verifyTelegramInitData(initData) {
        if (!initData || !process.env.TELEGRAM_BOT_TOKEN) {
            return null;
        }

        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) {
            return null;
        }
        params.delete('hash');

        const compareOrdinal = (a, b) => {
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
    static async telegramLogin(initData) {
        const telegramUser = this.verifyTelegramInitData(initData);
        if (!telegramUser) {
            throw new Error('Invalid Telegram authentication data');
        }

        const adminTelegramId = process.env.TELEGRAM_ADMIN_USER_ID || process.env.TELEGRAM_CHAT_ID;
        if (!adminTelegramId || String(telegramUser.id) !== String(adminTelegramId)) {
            const error = new Error('Not authorized as admin');
            error.notAuthorized = true;
            throw error;
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
        const user = await User.findByEmail(adminEmail);
        if (!user) {
            throw new Error('Admin account not found');
        }

        const token = this.generateToken(user.id);
        await User.saveAccessToken(user.id, token);
        const safeUser = await User.findById(user.id);

        return { user: safeUser, token };
    }
}

module.exports = AuthService;
