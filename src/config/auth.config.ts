// The sign-in settings, read once when the server starts.
// There is NO fallback secret on purpose: a server that starts without one would sign tokens anybody could forge.
export const JWT_SECRET = (process.env.JWT_SECRET ?? '').trim();

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in the .env file. Add a long random text, e.g. JWT_SECRET=<40 random characters>, then start again.');
}

export const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';
