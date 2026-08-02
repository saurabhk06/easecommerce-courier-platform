import type { Batch } from '@prisma/client';
import type { ShipmentQueue } from '../../infrastructure/shipment.queue.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { OrderService } from '../orders/order.service.js';
import type { BulkOrderRequest } from '../orders/order.schema.js';
import { isOrderConflict, type BatchWithOrders } from './batch.repository.js';
import type { BatchRepository } from './batch.repository.js';

export type BatchRepositoryPort = Pick<
  BatchRepository,
  'createWithOrders' | 'markQueueFailure' | 'findById'
>;

type BatchServiceDependencies = {
  batches: BatchRepositoryPort;
  orders: Pick<OrderService, 'prepareOrder'>;
  queue: Pick<ShipmentQueue, 'enqueueBatch'>;
};

export class BatchService {
  constructor(private readonly dependencies: BatchServiceDependencies) {}

  async createBatch(request: BulkOrderRequest): Promise<Batch> {
    const preparedOrders = request.orders.map((order) =>
      this.dependencies.orders.prepareOrder(order),
    );

    let batch: Batch;
    try {
      batch = await this.dependencies.batches.createWithOrders(preparedOrders);
    } catch (error) {
      if (isOrderConflict(error)) {
        throw new AppError('ORDER_ID_CONFLICT', 'One or more order IDs already exist', 409);
      }
      throw error;
    }

    try {
      await this.dependencies.queue.enqueueBatch(batch.id, request.orders);
      return batch;
    } catch (error) {
      await this.dependencies.batches.markQueueFailure(batch.id);
      throw new AppError(
        'QUEUE_UNAVAILABLE',
        'The batch was saved but could not be queued for processing',
        503,
        undefined,
        { cause: error },
      );
    }
  }

  async getBatch(batchId: string): Promise<BatchWithOrders> {
    const batch = await this.dependencies.batches.findById(batchId);
    if (!batch) throw new AppError('BATCH_NOT_FOUND', `Batch '${batchId}' was not found`, 404);
    return batch;
  }
}
