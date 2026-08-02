import { describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../../src/infrastructure/redis.js';
import { createShipmentJobName, ShipmentQueue } from '../../src/infrastructure/shipment.queue.js';
import { createOrderRequest } from '../fixtures/order-request.js';

describe('ShipmentQueue', () => {
  it('adds one deterministic job per order and closes cleanly', async () => {
    const addBulk = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const queue = new ShipmentQueue({} as RedisClient, 3, { addBulk, close });
    const secondOrder = { ...createOrderRequest, order_id: 'EC-API-002' };
    const batchId = '7da638c5-4954-40db-89d5-08f0ef5a8f12';

    await queue.enqueueBatch(batchId, [createOrderRequest, secondOrder]);
    await queue.close();

    expect(addBulk).toHaveBeenCalledWith([
      {
        name: createShipmentJobName,
        data: { batchId, order: createOrderRequest },
        opts: { jobId: `${batchId}-EC-API-001` },
      },
      {
        name: createShipmentJobName,
        data: { batchId, order: secondOrder },
        opts: { jobId: `${batchId}-EC-API-002` },
      },
    ]);
    expect(close).toHaveBeenCalledOnce();
  });
});
