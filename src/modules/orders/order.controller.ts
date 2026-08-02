import type { RequestHandler } from 'express';
import type { OrderService } from './order.service.js';
import { presentOrder, presentTracking } from './order.presenter.js';
import { orderIdSchema, type CreateOrderRequest } from './order.schema.js';

export function createOrderController(service: OrderService): RequestHandler {
  return async (_req, res) => {
    const request = res.locals.validatedBody as CreateOrderRequest;
    const outcome = await service.createOrder(request);
    const status = outcome.result === 'CREATED' ? 201 : outcome.result === 'PROCESSING' ? 202 : 200;
    res.status(status).json({ data: presentOrder(outcome.order) });
  };
}

export function getOrderController(service: OrderService): RequestHandler {
  return async (req, res) => {
    const orderId = orderIdSchema.parse(req.params.orderId);
    const order = await service.getOrder(orderId);
    res.status(200).json({ data: presentOrder(order) });
  };
}

export function trackOrderController(service: OrderService): RequestHandler {
  return async (req, res) => {
    const orderId = orderIdSchema.parse(req.params.orderId);
    const outcome = await service.trackOrder(orderId);
    res.status(200).json({ data: presentTracking(outcome.order, outcome.events) });
  };
}

export function cancelOrderController(service: OrderService): RequestHandler {
  return async (req, res) => {
    const orderId = orderIdSchema.parse(req.params.orderId);
    const order = await service.cancelOrder(orderId);
    res.status(200).json({
      data: {
        ...presentOrder(order),
        cancelled_at: order.updatedAt.toISOString(),
      },
    });
  };
}
