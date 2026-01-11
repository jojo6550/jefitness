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
        return res.status(401).json({ success: false, error: "Authentication required" });
    }

    try {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ success: false, error: "Server configuration error" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: "Authentication required" });
    }
}

module.exports = auth;
