import type { BatchWithOrders } from './batch.repository.js';

const failureMessages: Record<string, string> = {
  COURIER_REQUEST_REJECTED: 'The courier rejected the shipment request',
  COURIER_AUTHENTICATION_FAILED: 'Courier authentication failed',
  COURIER_UNAVAILABLE: 'The courier was unavailable',
  SHIPMENT_STATE_UNKNOWN: 'Shipment outcome requires reconciliation',
  QUEUE_UNAVAILABLE: 'Shipment could not be queued',
};

export function presentBatch(batch: BatchWithOrders): Record<string, unknown> {
  return {
    batch_id: batch.id,
    status: batch.status,
    total: batch.totalCount,
    succeeded: batch.successCount,
    failed: batch.failureCount,
    pending: batch.totalCount - batch.successCount - batch.failureCount,
    created_at: batch.createdAt.toISOString(),
    updated_at: batch.updatedAt.toISOString(),
    results: batch.orders.map((order) => ({
      order_id: order.orderId,
      courier_partner: order.courierPartner,
      processing_status: order.processingStatus,
      shipment_status: order.shipmentStatus,
      awb_number: order.awbNumber,
      ...(order.failureCode
        ? {
            error: {
              code: order.failureCode,
              message: failureMessages[order.failureCode] ?? 'Shipment processing failed',
            },
          }
        : {}),
    })),
  };
}
