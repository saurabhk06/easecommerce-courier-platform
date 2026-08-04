import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { createBatchController } from '../batches/batch.controller.js';
import type { BatchService } from '../batches/batch.service.js';
import {
  cancelOrderController,
  createOrderController,
  getOrderController,
  trackOrderController,
} from './order.controller.js';
import { createBulkOrderSchemaWithDefault, createOrderSchemaWithDefault } from './order.schema.js';
import type { OrderService } from './order.service.js';

export function createOrderRouter(
  service: OrderService,
  batchService?: BatchService,
  defaultCourierPartner = 'urbanebolt',
): Router {
  const router = Router();
  const createOrderSchema = createOrderSchemaWithDefault(defaultCourierPartner);
  const bulkOrderSchema = createBulkOrderSchemaWithDefault(defaultCourierPartner);

  if (batchService) {
    router.post('/bulk', validateBody(bulkOrderSchema), createBatchController(batchService));
  }
  router.post('/', validateBody(createOrderSchema), createOrderController(service));
  router.get('/:orderId', getOrderController(service));
  router.get('/:orderId/track', trackOrderController(service));
  router.post('/:orderId/cancel', cancelOrderController(service));

  return router;
}
