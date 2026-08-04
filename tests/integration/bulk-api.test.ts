import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeRedisClient, createRedisClient } from '../../src/infrastructure/redis.js';
import { ShipmentQueue } from '../../src/infrastructure/shipment.queue.js';
import { BatchRepository } from '../../src/modules/batches/batch.repository.js';
import { BatchService } from '../../src/modules/batches/batch.service.js';
import { createShipmentWorker } from '../../src/modules/batches/batch.worker.js';
import { CourierRegistry } from '../../src/modules/couriers/courier-registry.js';
import { MockCourierAdapter } from '../../src/modules/couriers/mock/mock-courier.adapter.js';
import { OrderRepository } from '../../src/modules/orders/order.repository.js';
import { OrderService } from '../../src/modules/orders/order.service.js';
import { TrackingRepository } from '../../src/modules/orders/tracking.repository.js';
import { createOrderRequest } from '../fixtures/order-request.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

if (!databaseUrl?.includes('localhost') || !redisUrl?.includes('localhost')) {
  throw new Error('Bulk integration tests require explicit local database and Redis URLs');
}

const database = new PrismaClient({ datasourceUrl: databaseUrl });
const apiRedis = createRedisClient(redisUrl, 'bulk-api-test');
const workerRedis = createRedisClient(redisUrl, 'bulk-worker-test', null);
const logger = pino({ level: 'silent' });
const courierRegistry = new CourierRegistry([
  new MockCourierAdapter({ shouldReject: (orderId) => orderId.endsWith('-FAIL') }),
]);
const orderService = new OrderService({
  orders: new OrderRepository(database),
  tracking: new TrackingRepository(database),
  couriers: courierRegistry,
});
const batchRepository = new BatchRepository(database);
const shipmentQueue = new ShipmentQueue(apiRedis, 1);
const batchService = new BatchService({
  batches: batchRepository,
  orders: orderService,
  queue: shipmentQueue,
});
const worker = createShipmentWorker(workerRedis, 3, {
  orders: orderService,
  batches: batchRepository,
  logger,
});
const app = createApp({
  logger,
  orderService,
  batchService,
  defaultCourierPartner: 'mock',
});

describe('bulk order API', () => {
  beforeAll(async () => {
    await database.$connect();
    await worker.waitUntilReady();
  });

  beforeEach(async () => {
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE "tracking_history", "orders", "batches" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await worker.close();
    await shipmentQueue.close();
    await closeRedisClient(apiRedis);
    await closeRedisClient(workerRedis);
    await database.$disconnect();
  });

  it('returns 202 and exposes partial courier failures per order', async () => {
    const response = await request(app)
      .post('/api/v1/orders/bulk')
      .send({
        orders: [
          withOrderId('EC-BULK-001'),
          withOrderId('EC-BULK-002-FAIL'),
          withOrderId('EC-BULK-003'),
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      data: { status: 'QUEUED', total: 3 },
    });

    const batchId = (response.body as { data: { batch_id: string } }).data.batch_id;
    const completed = await waitForTerminalBatch(batchId);

    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      data: {
        batch_id: batchId,
        status: 'PARTIALLY_COMPLETED',
        total: 3,
        succeeded: 2,
        failed: 1,
        pending: 0,
      },
    });
    const completedBody = completed.body as unknown as BatchResponseBody;
    const failedOrder = completedBody.data.results.find(
      (result) => result.order_id === 'EC-BULK-002-FAIL',
    );
    expect(failedOrder).toMatchObject({
      processing_status: 'FAILED',
      error: {
        code: 'COURIER_REQUEST_REJECTED',
        message: 'The courier rejected the shipment request',
      },
    });
    expect(JSON.stringify(completed.body)).not.toContain('MOCK_REJECTION');
  });

  it('rejects the complete request when any order is invalid', async () => {
    const response = await request(app)
      .post('/api/v1/orders/bulk')
      .send({
        orders: [
          withOrderId('EC-BULK-VALID'),
          {
            ...withOrderId('EC-BULK-INVALID'),
            consignee: { ...createOrderRequest.consignee, postal_code: 'invalid' },
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    await expect(database.batch.count()).resolves.toBe(0);
    await expect(database.order.count()).resolves.toBe(0);
  });

  it('rejects duplicate order IDs and batches larger than 100', async () => {
    const duplicate = await request(app)
      .post('/api/v1/orders/bulk')
      .send({ orders: [withOrderId('EC-DUPLICATE'), withOrderId('EC-DUPLICATE')] });
    const tooLarge = await request(app)
      .post('/api/v1/orders/bulk')
      .send({
        orders: Array.from({ length: 101 }, (_, index) => withOrderId(`EC-MAX-${index}`)),
      });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ field: 'orders.1.order_id' })],
      },
    });
    expect(tooLarge.status).toBe(400);
    await expect(database.batch.count()).resolves.toBe(0);
  });

  it('rolls back the complete batch when an order ID already exists', async () => {
    await request(app).post('/api/v1/orders').send(withOrderId('EC-EXISTING'));

    const response = await request(app)
      .post('/api/v1/orders/bulk')
      .send({ orders: [withOrderId('EC-NEW'), withOrderId('EC-EXISTING')] });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'ORDER_ID_CONFLICT' } });
    await expect(database.batch.count()).resolves.toBe(0);
    await expect(database.order.count()).resolves.toBe(1);
  });

  it('marks the saved batch and every order failed when Redis enqueueing fails', async () => {
    const failingBatchService = new BatchService({
      batches: batchRepository,
      orders: orderService,
      queue: { enqueueBatch: () => Promise.reject(new Error('Redis unavailable')) },
    });
    const failingApp = createApp({ logger, orderService, batchService: failingBatchService });

    const response = await request(failingApp)
      .post('/api/v1/orders/bulk')
      .send({ orders: [withOrderId('EC-QUEUE-001'), withOrderId('EC-QUEUE-002')] });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'QUEUE_UNAVAILABLE' } });
    const savedBatch = await database.batch.findFirstOrThrow({ include: { orders: true } });
    expect(savedBatch).toMatchObject({
      status: 'FAILED',
      totalCount: 2,
      successCount: 0,
      failureCount: 2,
    });
    expect(savedBatch.orders).toHaveLength(2);
    expect(
      savedBatch.orders.every(
        (order) => order.processingStatus === 'FAILED' && order.failureCode === 'QUEUE_UNAVAILABLE',
      ),
    ).toBe(true);
  });
});

function withOrderId(orderId: string) {
  return { ...createOrderRequest, order_id: orderId };
}

async function waitForTerminalBatch(batchId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const response = await request(app).get(`/api/v1/batches/${batchId}`);
    const body = response.body as unknown as BatchResponseBody;
    if (['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'].includes(body.data.status)) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Batch ${batchId} did not complete in time`);
}

type BatchResponseBody = {
  data: {
    status: string;
    results: Array<{
      order_id: string;
      processing_status: string;
      error?: { code: string; message: string };
    }>;
  };
};
