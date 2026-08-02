import { BatchStatus, type Batch } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BatchService } from '../../src/modules/batches/batch.service.js';
import type { BatchRepositoryPort } from '../../src/modules/batches/batch.service.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import { createOrderRequest } from '../fixtures/order-request.js';

const batch: Batch = {
  id: '7da638c5-4954-40db-89d5-08f0ef5a8f12',
  status: BatchStatus.QUEUED,
  totalCount: 1,
  successCount: 0,
  failureCount: 0,
  createdAt: new Date('2025-08-03T10:00:00.000Z'),
  updatedAt: new Date('2025-08-03T10:00:00.000Z'),
};

describe('BatchService', () => {
  it('persists all queued orders before enqueuing them', async () => {
    const prepared = preparedOrder();
    const prepareOrder = vi.fn().mockReturnValue(prepared);
    const createWithOrders = vi.fn().mockResolvedValue(batch);
    const enqueueBatch = vi.fn().mockResolvedValue(undefined);
    const service = new BatchService({
      batches: repository({ createWithOrders }),
      orders: { prepareOrder },
      queue: { enqueueBatch },
    });

    await expect(service.createBatch({ orders: [createOrderRequest] })).resolves.toBe(batch);
    expect(createWithOrders).toHaveBeenCalledWith([prepared]);
    expect(enqueueBatch).toHaveBeenCalledWith(batch.id, [createOrderRequest]);
    expect(createWithOrders.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueBatch.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('marks persisted orders failed when Redis cannot accept the batch', async () => {
    const markQueueFailure = vi.fn().mockResolvedValue({ ...batch, status: BatchStatus.FAILED });
    const service = new BatchService({
      batches: repository({
        createWithOrders: vi.fn().mockResolvedValue(batch),
        markQueueFailure,
      }),
      orders: { prepareOrder: vi.fn().mockReturnValue(preparedOrder()) },
      queue: { enqueueBatch: vi.fn().mockRejectedValue(new Error('Redis unavailable')) },
    });

    const error = await service
      .createBatch({ orders: [createOrderRequest] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'QUEUE_UNAVAILABLE', statusCode: 503 });
    expect(markQueueFailure).toHaveBeenCalledWith(batch.id);
  });
});

function preparedOrder() {
  return {
    orderId: createOrderRequest.order_id,
    requestFingerprint: 'a'.repeat(64),
    courierPartner: 'mock',
    serviceLevel: 'NEXT_DAY' as const,
    normalizedRequest: { orderId: createOrderRequest.order_id },
  };
}

function repository(overrides: Partial<BatchRepositoryPort>): BatchRepositoryPort {
  return {
    createWithOrders: vi.fn(),
    markQueueFailure: vi.fn(),
    findById: vi.fn(),
    ...overrides,
  };
}
