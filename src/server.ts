import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { Database } from './infrastructure/database.js';
import { checkRedisHealth, closeRedisClient, createRedisClient } from './infrastructure/redis.js';
import { createCourierRegistry } from './modules/couriers/create-courier-registry.js';
import { OrderRepository } from './modules/orders/order.repository.js';
import { OrderService } from './modules/orders/order.service.js';
import { TrackingRepository } from './modules/orders/tracking.repository.js';

const env = parseEnvironment(process.env);
const logger = createLogger(env.LOG_LEVEL);
const database = new Database();
const redis = createRedisClient(env.REDIS_URL, 'api-readiness');
redis.on('error', (error) => logger.error({ err: error }, 'Redis connection error'));

let server: Server | undefined;
let isShuttingDown = false;

async function start(): Promise<void> {
  await database.connect();

  const orderService = new OrderService({
    orders: new OrderRepository(database.client),
    tracking: new TrackingRepository(database.client),
    couriers: createCourierRegistry(env),
  });

  const app = createApp({
    logger,
    readinessChecks: [() => database.checkHealth(), () => checkRedisHealth(redis)],
    orderService,
  });

  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API server started');
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown started');

  const forceShutdown = setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceShutdown.unref();

  try {
    await closeHttpServer(server);
    await closeRedisClient(redis);
    await database.disconnect();
    clearTimeout(forceShutdown);
    logger.info('Graceful shutdown completed');
  } catch (error) {
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  }
}

function closeHttpServer(httpServer: Server | undefined): Promise<void> {
  if (!httpServer) return Promise.resolve();

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API server failed to start');
  redis.disconnect();
  process.exit(1);
});
