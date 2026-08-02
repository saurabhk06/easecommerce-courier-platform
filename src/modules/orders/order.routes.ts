import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import {
  cancelOrderController,
  createOrderController,
  getOrderController,
  trackOrderController,
} from './order.controller.js';
import { createOrderSchema } from './order.schema.js';
import type { OrderService } from './order.service.js';

export function createOrderRouter(service: OrderService): Router {
  const router = Router();

  router.post('/', validateBody(createOrderSchema), createOrderController(service));
  router.get('/:orderId', getOrderController(service));
  router.get('/:orderId/track', trackOrderController(service));
  router.post('/:orderId/cancel', cancelOrderController(service));

  return router;
}
