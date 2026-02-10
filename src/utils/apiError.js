/**
 * Reusable API error helper function
 * Returns standardized error response format
 */
const apiError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

module.exports = apiError;
