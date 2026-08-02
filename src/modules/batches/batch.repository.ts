import {
  BatchStatus,
  type Batch,
  type Order,
  type PrismaClient,
  ProcessingStatus,
} from '@prisma/client';

export type BatchWithOrders = Batch & { orders: Order[] };

export class BatchRepository {
  constructor(private readonly database: PrismaClient) {}

  async create(totalCount: number): Promise<Batch> {
    return this.database.batch.create({ data: { totalCount } });
  }

  async findById(id: string): Promise<BatchWithOrders | null> {
    return this.database.batch.findUnique({
      where: { id },
      include: { orders: { orderBy: { createdAt: 'asc' } } },
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
