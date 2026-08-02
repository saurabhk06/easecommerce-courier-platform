import type { Order, TrackingEvent } from '@prisma/client';

export function presentOrder(order: Order): Record<string, unknown> {
  return {
    order_id: order.orderId,
    courier_partner: order.courierPartner,
    courier_shipment_id: order.courierShipmentId,
    awb_number: order.awbNumber,
    shipment_status: order.shipmentStatus,
    processing_status: order.processingStatus,
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
  };
}

export function presentTracking(order: Order, events: TrackingEvent[]): Record<string, unknown> {
  return {
    order_id: order.orderId,
    courier_partner: order.courierPartner,
    awb_number: order.awbNumber,
    shipment_status: order.shipmentStatus,
    last_updated_at: order.updatedAt.toISOString(),
    events: events.map((event) => ({
      status: event.status,
      description: event.description,
      location: event.location,
      occurred_at: event.occurredAt.toISOString(),
    })),
  };
}
