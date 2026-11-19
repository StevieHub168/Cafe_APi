const AuthService = require('../services/authService');

// A mistake in what was typed is a 400; a user that does not exist is a 404.
const fail = (res, error) => res.status(error.statusCode || 400).json({ error: error.message });

class UserController {
    // GET /api/users
    static async list(req, res) {
        try {
            res.status(200).json(await AuthService.listUsers());
        } catch (error) {
            fail(res, error);
        }
    }

    // PUT /api/users/:id/password   body: { password }
    static async resetPassword(req, res) {
        try {
            res.status(200).json(await AuthService.resetPassword(req.params.id, req.body?.password, req.user.userId));
        } catch (error) {
            fail(res, error);
        }
    }
}

module.exports = UserController;
