import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { processShipmentJob } from '../../src/modules/batches/batch.worker.js';
import { createOrderRequest } from '../fixtures/order-request.js';

const batchId = '7da638c5-4954-40db-89d5-08f0ef5a8f12';
const job = {
  id: `${batchId}-${createOrderRequest.order_id}`,
  data: { batchId, order: createOrderRequest },
};

describe('processShipmentJob', () => {
  it('processes an order and refreshes its batch summary', async () => {
    const createOrder = vi.fn().mockResolvedValue({});
    const refreshSummary = vi.fn().mockResolvedValue({});

    await processShipmentJob(job, {
      orders: { createOrder },
      batches: { refreshSummary },
      logger: pino({ level: 'silent' }),
    });

    expect(createOrder).toHaveBeenCalledWith(createOrderRequest, batchId);
    expect(refreshSummary).toHaveBeenCalledWith(batchId);
  });

  it('refreshes the batch summary and lets BullMQ handle a failed job', async () => {
    const courierError = new Error('courier unavailable');
    const createOrder = vi.fn().mockRejectedValue(courierError);
    const refreshSummary = vi.fn().mockResolvedValue({});

    await expect(
      processShipmentJob(job, {
        orders: { createOrder },
        batches: { refreshSummary },
        logger: pino({ level: 'silent' }),
      }),
    ).rejects.toBe(courierError);
    expect(refreshSummary).toHaveBeenCalledWith(batchId);
  });
});
