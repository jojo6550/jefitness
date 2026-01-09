const APIKey = require('../models/APIKey');

const apiKeyAuth = async (req, res, next) => {
    try {
        // Extract API key from headers
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

        if (!apiKey) {
            return res.status(401).json({ msg: 'API key required' });
        }

        // Find and validate API key
        const keyDoc = await APIKey.findByKey(apiKey);

        if (!keyDoc) {
            return res.status(401).json({ msg: 'Invalid or expired API key' });
        }

        // Check if the requested scope is allowed
        const requiredScope = req.requiredScope || 'read';
        if (!keyDoc.scopes.includes(requiredScope) && !keyDoc.scopes.includes('admin')) {
            return res.status(403).json({ msg: 'Insufficient API key permissions' });
        }

        // Attach user and key info to request
        req.apiKey = keyDoc;
        req.user = keyDoc.userId;

        next();
    } catch (error) {
        console.error('API Key authentication error:', error);
        res.status(500).json({ msg: 'Authentication error' });
    }
};

// Middleware to require specific scopes
const requireScope = (scope) => {
    return (req, res, next) => {
        req.requiredScope = scope;
        next();
    };
};

module.exports = { apiKeyAuth, requireScope };
