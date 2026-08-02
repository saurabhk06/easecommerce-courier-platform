import type { RequestHandler } from 'express';
import type { BulkOrderRequest } from '../orders/order.schema.js';
import { presentBatch } from './batch.presenter.js';
import { batchIdSchema } from './batch.schema.js';
import type { BatchService } from './batch.service.js';

export function createBatchController(service: BatchService): RequestHandler {
  return async (_req, res) => {
    const request = res.locals.validatedBody as BulkOrderRequest;
    const batch = await service.createBatch(request);
    res.status(202).json({
      data: {
        batch_id: batch.id,
        status: batch.status,
        total: batch.totalCount,
        status_url: `/api/v1/batches/${batch.id}`,
      },
    });
  };
}

export function getBatchController(service: BatchService): RequestHandler {
  return async (req, res) => {
    const batchId = batchIdSchema.parse(req.params.batchId);
    const batch = await service.getBatch(batchId);
    res.status(200).json({ data: presentBatch(batch) });
  };
}
