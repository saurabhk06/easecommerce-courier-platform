import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/app-error.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = res.locals.requestId;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid fields',
        request_id: requestId,
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      req.log.error({ err: error, code: error.code }, error.message);
    }

    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        request_id: requestId,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  req.log.error({ err: error }, 'Unhandled request error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      request_id: requestId,
    },
  });
};
