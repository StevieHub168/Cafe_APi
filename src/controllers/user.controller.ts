import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { parsePageRequest } from '../utils/pagination';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status
// (a mistake in what was typed is a 400, a user that does not exist is a 404).
export class UserController {
    // GET /api/users                                  everybody
    // GET /api/users?page=1&per_page=20               one page (see utils/pagination.ts)
    static async list(req: Request, res: Response): Promise<void> {
        const page = parsePageRequest(req.query);
        res.status(200).json(page ? await AuthService.listUsersPage(page) : await AuthService.listUsers());
    }

    // PUT /api/users/:id/password   body: { password }
    static async resetPassword(req: Request, res: Response): Promise<void> {
        res.status(200).json(await AuthService.resetPassword(String(req.params.id), req.body?.password, req.user!.userId));
    }
}
