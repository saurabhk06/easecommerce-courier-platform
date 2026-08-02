import 'dotenv/config';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { Database } from './infrastructure/database.js';
import { closeRedisClient, createRedisClient } from './infrastructure/redis.js';
import { BatchRepository } from './modules/batches/batch.repository.js';
import { createShipmentWorker } from './modules/batches/batch.worker.js';
import { createCourierRegistry } from './modules/couriers/create-courier-registry.js';
import { OrderRepository } from './modules/orders/order.repository.js';
import { OrderService } from './modules/orders/order.service.js';
import { TrackingRepository } from './modules/orders/tracking.repository.js';

const env = parseEnvironment(process.env);
const logger = createLogger(env.LOG_LEVEL);
const database = new Database();
const redis = createRedisClient(env.REDIS_URL, 'shipment-worker', null);
redis.on('error', (error) => logger.error({ err: error }, 'Redis connection error'));
const orders = new OrderService({
  orders: new OrderRepository(database.client),
  tracking: new TrackingRepository(database.client),
  couriers: createCourierRegistry(env),
});
const batches = new BatchRepository(database.client);
const worker = createShipmentWorker(redis, env.BULK_WORKER_CONCURRENCY, {
  orders,
  batches,
  logger,
});

let isShuttingDown = false;

async function start(): Promise<void> {
  await database.connect();
  await worker.waitUntilReady();
  logger.info({ concurrency: env.BULK_WORKER_CONCURRENCY }, 'Bulk shipment worker started');
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Worker graceful shutdown started');
  try {
    await worker.close();
    await closeRedisClient(redis);
    await database.disconnect();
    logger.info('Worker graceful shutdown completed');
  } catch (error) {
    logger.error({ err: error }, 'Worker graceful shutdown failed');
    process.exitCode = 1;
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Bulk shipment worker failed to start');
  await worker.close(true);
  redis.disconnect();
  await database.disconnect();
  process.exit(1);
});
