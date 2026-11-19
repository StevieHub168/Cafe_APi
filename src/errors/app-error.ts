// An error the person using the app is meant to read: "Full price must be more than 0", "Booking not found", ...
// Throw one of these from a service and the error handler (middleware/error-handler.middleware.ts) sends it as JSON with the right status.
// Any other error (a bug, the database is down) is NOT shown: the person only sees "Something went wrong".
export class AppError extends Error {
    constructor(message: string, public readonly statusCode: number) {
        super(message);
        this.name = 'AppError';
    }
}

/** 400: what was typed is not right. */
export const badRequest = (message: string): AppError => new AppError(message, 400);

/** 401: not signed in, or the sign-in no longer works. */
export const unauthorized = (message = 'Please sign in'): AppError => new AppError(message, 401);

/** 403: signed in, but not allowed to do this. */
export const forbidden = (message = 'You are not allowed to do this'): AppError => new AppError(message, 403);

/** 404: `what` does not exist. notFound('Booking') -> "Booking not found". */
export const notFound = (what: string): AppError => new AppError(`${what} not found`, 404);

/** 409: someone else did it first, or it is not in the right state. The screen can say "just booked", "just picked up". */
export const conflict = (message: string): AppError => new AppError(message, 409);

/** 429: too many tries. */
export const tooManyRequests = (message: string): AppError => new AppError(message, 429);
