import {
  BatchStatus,
  type Batch,
  type Order,
  type PrismaClient,
  ProcessingStatus,
  Prisma,
} from '@prisma/client';
import type { CreateOrderRecord } from '../orders/order.repository.js';

export type BatchWithOrders = Batch & { orders: Order[] };

export class BatchRepository {
  constructor(private readonly database: PrismaClient) {}

  async create(totalCount: number): Promise<Batch> {
    return this.database.batch.create({ data: { totalCount } });
  }

  async createWithOrders(orders: CreateOrderRecord[]): Promise<Batch> {
    return this.database.$transaction(async (transaction) => {
      const batch = await transaction.batch.create({ data: { totalCount: orders.length } });
      await transaction.order.createMany({
        data: orders.map((order) => ({ ...order, batchId: batch.id })),
      });
      return batch;
    });
  }

  async markQueueFailure(id: string): Promise<Batch> {
    return this.database.$transaction(async (transaction) => {
      const batch = await transaction.batch.findUniqueOrThrow({ where: { id } });
      await transaction.order.updateMany({
        where: { batchId: id, processingStatus: ProcessingStatus.QUEUED },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          failureCode: 'QUEUE_UNAVAILABLE',
          failureDetails: { message: 'Shipment job could not be enqueued' },
        },
      });

      return transaction.batch.update({
        where: { id },
        data: { status: BatchStatus.FAILED, successCount: 0, failureCount: batch.totalCount },
      });
    });
  }

  async findById(id: string): Promise<BatchWithOrders | null> {
    return this.database.batch.findUnique({
      where: { id },
      include: { orders: { orderBy: [{ createdAt: 'asc' }, { orderId: 'asc' }] } },
    });
  }

  async refreshSummary(id: string): Promise<Batch> {
    return this.database.$transaction(async (transaction) => {
      const [batch, successCount, failureCount, processingCount] = await Promise.all([
        transaction.batch.findUniqueOrThrow({ where: { id } }),
        transaction.order.count({
          where: { batchId: id, processingStatus: ProcessingStatus.SUCCEEDED },
        }),
        transaction.order.count({
          where: {
            batchId: id,
            processingStatus: {
              in: [ProcessingStatus.FAILED, ProcessingStatus.RECONCILIATION_REQUIRED],
            },
          },
        }),
        transaction.order.count({
          where: {
            batchId: id,
            processingStatus: {
              in: [ProcessingStatus.QUEUED, ProcessingStatus.PROCESSING],
            },
          },
        }),
      ]);

      const status = resolveBatchStatus({
        totalCount: batch.totalCount,
        successCount,
        failureCount,
        processingCount,
      });

      return transaction.batch.update({
        where: { id },
        data: { successCount, failureCount, status },
      });
    });
  }
}

export function isOrderConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function resolveBatchStatus(counts: {
  totalCount: number;
  successCount: number;
  failureCount: number;
  processingCount: number;
}): BatchStatus {
  if (counts.processingCount > 0) return BatchStatus.PROCESSING;
  if (counts.successCount === counts.totalCount) return BatchStatus.COMPLETED;
  if (counts.failureCount === counts.totalCount) return BatchStatus.FAILED;
  return BatchStatus.PARTIALLY_COMPLETED;
}
