/**
 * API Versioning Middleware
 * Handles API version headers and validation
 */
const versioning = (req, res, next) => {
  // Set API version header
  res.set('X-API-Version', 'v1');

  // Optional: Validate minimum version requirements
  // Find the API version header case-insensitively
  const headerKey = Object.keys(req.headers).find(key => key.toLowerCase() === 'x-api-version');
  const clientVersion = headerKey ? req.headers[headerKey] : null;
  if (clientVersion && clientVersion !== 'v1') {
    console.warn(`Client using API version: ${clientVersion}, server supports: v1`);
  }

  next();
};

module.exports = versioning;
