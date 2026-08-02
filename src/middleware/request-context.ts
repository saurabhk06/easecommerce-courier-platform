import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header('x-request-id')?.trim();
  const requestId = incomingRequestId || randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
