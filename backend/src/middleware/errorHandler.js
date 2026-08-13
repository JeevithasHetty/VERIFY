import multer from 'multer';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  if (err instanceof multer.MulterError) {
    status = 400;
    code = err.code;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size';
    }
  }

  // Never leak stack traces or internal details to clients.
  logger.error(
    { event: 'request_error', code, status, error: err.message, stack: err.stack },
    'Request failed'
  );

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Internal server error' : message,
    },
  });
}

export default { AppError, notFoundHandler, errorHandler };
