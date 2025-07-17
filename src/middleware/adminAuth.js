// middleware/adminAuth.js
const adminAuth = (req, res, next) => {
    // req.user is populated by the 'auth' middleware
    if (!req.user) {
        return res.status(401).json({ msg: 'No user data found in request. Authentication required.' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied. Administrator privileges required.' });
    }
    next(); // User is an admin, proceed to the next middleware/route handler
};

module.exports = adminAuth;
