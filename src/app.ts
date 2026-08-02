import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestContext } from './middleware/request-context.js';
import { createHealthRouter, type ReadinessCheck } from './modules/health/health.routes.js';
import { createOrderRouter } from './modules/orders/order.routes.js';
import type { OrderService } from './modules/orders/order.service.js';

type AppDependencies = {
  logger: Logger;
  readinessChecks?: ReadinessCheck[];
  orderService?: OrderService;
};

export function createApp({
  logger,
  readinessChecks = [],
  orderService,
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => res.getHeader('x-request-id') as string,
      customProps: (_req, res) => ({ requestId: res.locals.requestId }),
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/health', createHealthRouter(readinessChecks));
  if (orderService) app.use('/api/v1/orders', createOrderRouter(orderService));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
