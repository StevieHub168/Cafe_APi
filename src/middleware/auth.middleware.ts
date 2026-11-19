import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/auth.config';
import { Role } from '../enums/role.enum';
import { forbidden, unauthorized } from '../errors/app-error';
import { UserRepository } from '../repositories/user.repository';

/** Who is signed in. Put on the request by requireAuth. */
export interface AuthUser {
    userId: number;
    token: string;
    username: string;
    email: string;
    fullName: string;
    role: Role;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request { user?: AuthUser }
    }
}

/** The token of "Authorization: Bearer <token>", or null. */
const tokenOf = (req: Request): string | null => {
    const header = req.headers.authorization;
    return header?.startsWith('Bearer ') ? header.substring(7) : null;
};

/** Checks the signature and the date. Throws a 401 in plain words. */
function checkToken(token: string): { userId: number } {
    try {
        return jwt.verify(token, JWT_SECRET) as unknown as { userId: number };
    } catch (error) {
        throw unauthorized((error as Error).name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token');
    }
}

// A token works only while it is the one saved for its user (logging out, or signing in again elsewhere, replaces it).
export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = tokenOf(req);
    if (!token) throw unauthorized('No token provided');

    const decoded = checkToken(token);
    const user = await UserRepository.findByAccessToken(token);
    if (!user) throw unauthorized('Token has been invalidated. Please login again.');

    req.user = {
        userId: decoded.userId,
        token,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role
    };
    next();
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== Role.ADMIN) throw forbidden('Admin access required');
    next();
};
