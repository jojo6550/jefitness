/**
 * API Versioning Middleware
 * Handles API version headers and validation
 */
const versioning = (req, res, next) => {
  // Set API version header
  res.set('X-API-Version', 'v1');

  // Optional: Validate minimum version requirements
  const clientVersion = req.headers['x-api-version'];
  if (clientVersion && clientVersion !== 'v1') {
    console.warn(`Client using API version: ${clientVersion}, server supports: v1`);
  }

  next();
};

module.exports = versioning;
