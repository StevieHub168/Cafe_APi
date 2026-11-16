const AuthService = require('../services/authService');

class AuthController {
    static async register(req, res) {
        try {
            const { username, email, password, full_name, role, phone } = req.body;

            if (!username || !email || !password) {
                return res.status(400).json({ error: 'Username, email, and password are required' });
            }

            const result = await AuthService.register({ username, email, password, full_name, role, phone });
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const result = await AuthService.login(email, password);
            res.status(200).json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }

    static async telegramLogin(req, res) {
        try {
            const { initData } = req.body;

            if (!initData) {
                return res.status(400).json({ error: 'initData is required' });
            }

            const result = await AuthService.telegramLogin(initData);
            res.status(200).json(result);
        } catch (error) {
            const status = error.notAuthorized ? 403 : 401;
            res.status(status).json({ error: error.message });
        }
    }

    // POST /api/auth/logout
    static async logout(req, res) {
        try {
            res.status(200).json({ message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // GET /api/auth/me
    static async me(req, res) {
        try {
            const user = await AuthService.getUserById(req.user.userId);
            res.status(200).json({ user });
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // GET /api/auth/user/:id
    static async getUserInfo(req, res) {
        try {
            const userId = req.params.id;
            const user = await AuthService.getUserById(userId);
            res.status(200).json(user);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }
}

module.exports = AuthController;
