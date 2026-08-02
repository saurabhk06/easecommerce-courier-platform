import { Worker, type Job } from 'bullmq';
import type { Logger } from 'pino';
import {
  shipmentJobSchema,
  shipmentQueueName,
  type createShipmentJobName,
  type ShipmentJobData,
} from '../../infrastructure/shipment.queue.js';
import type { RedisClient } from '../../infrastructure/redis.js';
import type { OrderService } from '../orders/order.service.js';
import type { BatchRepository } from './batch.repository.js';

type ShipmentWorkerDependencies = {
  orders: Pick<OrderService, 'createOrder'>;
  batches: Pick<BatchRepository, 'refreshSummary'>;
  logger: Logger;
};

export async function processShipmentJob(
  job: Pick<Job<ShipmentJobData>, 'data' | 'id'>,
  dependencies: ShipmentWorkerDependencies,
): Promise<void> {
  const data = shipmentJobSchema.parse(job.data);
  const context = { jobId: job.id, batchId: data.batchId, orderId: data.order.order_id };

  dependencies.logger.info(context, 'Bulk shipment job started');
  try {
    await dependencies.orders.createOrder(data.order, data.batchId);
    dependencies.logger.info(context, 'Bulk shipment job completed');
  } catch (error) {
    dependencies.logger.error({ ...context, err: error }, 'Bulk shipment job failed');
    throw error;
  } finally {
    await dependencies.batches.refreshSummary(data.batchId);
  }
}

export function createShipmentWorker(
  connection: RedisClient,
  concurrency: number,
  dependencies: ShipmentWorkerDependencies,
): Worker<ShipmentJobData, void, typeof createShipmentJobName> {
  const worker = new Worker<ShipmentJobData, void, typeof createShipmentJobName>(
    shipmentQueueName,
    (job) => processShipmentJob(job, dependencies),
    { connection, concurrency },
  );

  worker.on('error', (error) => {
    dependencies.logger.error({ err: error }, 'Bulk shipment worker error');
  });

  return worker;
}
