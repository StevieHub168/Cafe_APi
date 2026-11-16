const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');

        const user = await User.findByAccessToken(token);
        if (!user) {
            return res.status(401).json({ error: 'Token has been invalidated. Please login again.' });
        }

        req.user = {
            userId: decoded.userId,
            token: token,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            role: user.role
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const requireAuth = (req, res, next) => {
    verifyToken(req, res, next);
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = {
    verifyToken,
    requireAuth,
    requireAdmin
};
