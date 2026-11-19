import { Request, Response } from 'express';
import { badRequest } from '../errors/app-error';
import { AuthService } from '../services/auth.service';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status.
export class AuthController {
    static async register(req: Request, res: Response): Promise<void> {
        const { username, email, password, full_name, role, phone } = req.body ?? {};
        if (!email || !password) throw badRequest('Email and password are required');

        const result = await AuthService.register({ username, email, password, full_name, role, phone });
        res.status(201).json(result);
    }

    static async login(req: Request, res: Response): Promise<void> {
        const { email, password } = req.body ?? {};
        if (!email || !password) throw badRequest('Email and password are required');

        res.status(200).json(await AuthService.login(email, password));
    }

    static async telegramLogin(req: Request, res: Response): Promise<void> {
        const { initData } = req.body ?? {};
        if (!initData) throw badRequest('initData is required');

        res.status(200).json(await AuthService.telegramLogin(initData));
    }

    // POST /api/auth/logout: the token stops working at once (not only when it runs out).
    static async logout(req: Request, res: Response): Promise<void> {
        res.status(200).json(await AuthService.logout(req.user!.userId));
    }

    // GET /api/auth/me
    static async me(req: Request, res: Response): Promise<void> {
        res.status(200).json({ user: await AuthService.getUserById(req.user!.userId) });
    }

    // GET /api/auth/user/:id
    static async getUserInfo(req: Request, res: Response): Promise<void> {
        res.status(200).json(await AuthService.getUserById(String(req.params.id)));
    }
}
