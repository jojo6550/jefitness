/**
 * User Cache Middleware
 * Initializes per-request user cache
 * Should be mounted early in middleware stack, before routes
 */

const userCache = require('../services/userCache');

function userCacheMiddleware(req, res, next) {
  userCache.initRequestCache(req);
  next();
}

module.exports = userCacheMiddleware;
