import { Router } from 'express';
import { getBatchController } from './batch.controller.js';
import type { BatchService } from './batch.service.js';

export function createBatchRouter(service: BatchService): Router {
  const router = Router();
  router.get('/:batchId', getBatchController(service));
  return router;
}
