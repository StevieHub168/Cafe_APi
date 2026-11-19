import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export const SOMETHING_WRONG = 'Something went wrong. Please try again.';

// A path that does not exist.
export function notFoundHandler(_req: Request, res: Response): void {
    res.status(404).json({ error: 'Not found' });
}

// An error from Express itself (a body that is too big, JSON that is not valid) carries its own 4xx status.
interface ExpressError extends Error { status?: number; statusCode?: number; expose?: boolean }

// The one place every error ends up (Express 5 sends the errors of async handlers here, so controllers need no try / catch).
//   - an AppError is meant for the person: its message and status are sent;
//   - a mistake in the request itself (too big, not valid JSON) comes from Express with its own 4xx status: also safe to send;
//   - anything else is a bug or a failure inside (database down...): written to the log, and the person only gets a general message,
//     never the SQL text or the stack.
export function errorHandler(error: ExpressError, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) return next(error);

    if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
    }

    const status = error.status ?? error.statusCode ?? 0;
    if (error.expose === true && status >= 400 && status < 500) {
        res.status(status).json({ error: error.message });
        return;
    }

    console.error(`✗ ${req.method} ${req.originalUrl}\n${error.stack || error}`);
    res.status(500).json({ error: SOMETHING_WRONG });
}
