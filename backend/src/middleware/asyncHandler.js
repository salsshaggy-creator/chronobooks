// Express 4 doesn't forward rejected promises to the error handler on its own.
// Wrap every async controller with this so a thrown error becomes a clean JSON response
// instead of an unhandled rejection.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
