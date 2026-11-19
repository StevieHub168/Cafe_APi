import { NextFunction, Request, Response } from 'express';
import { tooManyRequests } from '../errors/app-error';

interface Options { maxFailures?: number; windowMs?: number; now?: () => number }
interface Failures { count: number; resetAt: number }

// Stops somebody from trying passwords again and again: after `maxFailures` wrong sign-ins for the same email from the same place,
// that pair is blocked for `windowMs`. A correct sign-in clears the count. Kept in memory (it starts again when the server restarts),
// which is enough for one server.
export function createLoginLimiter({ maxFailures = 8, windowMs = 15 * 60 * 1000, now = Date.now }: Options = {}) {
    const failures = new Map<string, Failures>();   // "ip|email" -> { count, resetAt }

    const keyOf = (req: Request) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`;

    const current = (key: string): Failures | null => {
        const entry = failures.get(key);
        if (entry && entry.resetAt <= now()) {
            failures.delete(key);
            return null;
        }
        return entry || null;
    };

    const addFailure = (key: string): void => {
        const entry = current(key) || { count: 0, resetAt: now() + windowMs };
        entry.count += 1;
        failures.set(key, entry);
    };

    // Old entries of people who never came back must not pile up.
    const forgetExpired = (): void => {
        for (const key of failures.keys()) current(key);
    };

    return function loginLimiter(req: Request, res: Response, next: NextFunction): void {
        const key = keyOf(req);
        const entry = current(key);
        if (entry && entry.count >= maxFailures) {
            const minutes = Math.max(1, Math.ceil((entry.resetAt - now()) / 60000));
            return next(tooManyRequests(`Too many tries. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`));
        }

        // The answer decides: 401 = wrong password (counted), a success clears the count. Anything else (e.g. a missing field) is not counted.
        res.on('finish', () => {
            if (res.statusCode === 401) {
                forgetExpired();
                addFailure(key);
            } else if (res.statusCode < 400) {
                failures.delete(key);
            }
        });
        next();
    };
}

export const loginLimiter = createLoginLimiter();
