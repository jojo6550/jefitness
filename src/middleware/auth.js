// middleware/auth.js
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
    const authHeader = req.header('Authorization');
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '').trim();
    } else {
        token = req.header('x-auth-token'); // Fallback
    }

    if (!token) {
        console.error('Auth Middleware: No token provided, authorization denied.');
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            console.error('Auth Middleware Error: JWT_SECRET is not defined in environment variables!');
            return res.status(500).json({ msg: 'Server configuration error: JWT secret missing.' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Auth Middleware: Token verification failed:', err.message);
        return res.status(400).json({ msg: 'Token is not valid' });
    }
}

module.exports = auth;
