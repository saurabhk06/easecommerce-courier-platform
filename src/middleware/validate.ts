import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    res.locals.validatedBody = schema.parse(req.body);
    next();
  };
}
