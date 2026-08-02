import { Queue, type JobsOptions } from 'bullmq';
import { z } from 'zod';
import { createOrderSchema, type CreateOrderRequest } from '../modules/orders/order.schema.js';
import type { RedisClient } from './redis.js';

export const shipmentQueueName = 'shipment-creation';
export const createShipmentJobName = 'create-shipment';

export const shipmentJobSchema = z.object({
  batchId: z.uuid(),
  order: createOrderSchema,
});

export type ShipmentJobData = z.infer<typeof shipmentJobSchema>;

type ShipmentQueueClient = Pick<
  Queue<ShipmentJobData, void, typeof createShipmentJobName>,
  'addBulk' | 'close'
>;

export class ShipmentQueue {
  private readonly jobs: ShipmentQueueClient;

  constructor(connection: RedisClient, attempts: number, queue?: ShipmentQueueClient) {
    this.jobs =
      queue ??
      new Queue<ShipmentJobData, void, typeof createShipmentJobName>(shipmentQueueName, {
        connection,
        defaultJobOptions: defaultJobOptions(attempts),
      });
  }

  async enqueueBatch(batchId: string, orders: CreateOrderRequest[]): Promise<void> {
    await this.jobs.addBulk(
      orders.map((order) => ({
        name: createShipmentJobName,
        data: { batchId, order },
        opts: { jobId: `${batchId}-${order.order_id}` },
      })),
    );
  }

  async close(): Promise<void> {
    await this.jobs.close();
  }
}

function defaultJobOptions(attempts: number): JobsOptions {
  return {
    attempts,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 3_600, count: 1_000 },
    removeOnFail: { age: 86_400, count: 5_000 },
  };
}
