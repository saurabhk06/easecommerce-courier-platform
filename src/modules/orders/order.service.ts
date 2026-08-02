import { ProcessingStatus, type Order, type Prisma, type TrackingEvent } from '@prisma/client';
import { stableHash } from '../../shared/stable-hash.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CourierRegistry } from '../couriers/courier-registry.js';
import { CourierError } from '../couriers/courier-error.js';
import type { TrackingEvent as CourierTrackingEvent } from '../couriers/courier.types.js';
import type { OrderRepository } from './order.repository.js';
import type { TrackingRepository } from './tracking.repository.js';
import { toCreateShipmentInput } from './order.mapper.js';
import type { CreateOrderRequest } from './order.schema.js';

export type CreateOrderOutcome = {
  order: Order;
  result: 'CREATED' | 'EXISTING' | 'PROCESSING';
};

export type TrackingOutcome = {
  order: Order;
  events: TrackingEvent[];
};

type OrderServiceDependencies = {
  orders: OrderRepository;
  tracking: TrackingRepository;
  couriers: CourierRegistry;
  clock?: () => Date;
};

const protectedTerminalStatuses = new Set(['DELIVERED', 'CANCELLED', 'RETURNED']);
const nonCancellableStatuses = new Set(['DELIVERED', 'RETURNED', 'FAILED']);

export class OrderService {
  private readonly clock: () => Date;

  constructor(private readonly dependencies: OrderServiceDependencies) {
    this.clock = dependencies.clock ?? (() => new Date());
  }

  async createOrder(request: CreateOrderRequest): Promise<CreateOrderOutcome> {
    const normalizedInput = toCreateShipmentInput(request);
    const adapter = this.dependencies.couriers.get(request.courier_partner);
    const requestFingerprint = stableHash(normalizedInput);
    const existingOrNew = await this.dependencies.orders.createOrGet({
      orderId: request.order_id,
      requestFingerprint,
      courierPartner: request.courier_partner,
      serviceLevel: request.service_level,
      normalizedRequest: toJsonValue(normalizedInput),
    });

    if (!existingOrNew.created) {
      if (existingOrNew.order.requestFingerprint !== requestFingerprint) {
        throw new AppError(
          'ORDER_ID_CONFLICT',
          `Order '${request.order_id}' already exists with a different payload`,
          409,
        );
      }

      if (existingOrNew.order.processingStatus === ProcessingStatus.SUCCEEDED) {
        return { order: existingOrNew.order, result: 'EXISTING' };
      }
    }

    const claim = await this.dependencies.orders.claimForProcessing(request.order_id);
    if (!claim) throw new AppError('ORDER_NOT_FOUND', 'Order disappeared during processing', 404);

    if (claim.outcome === 'ALREADY_SUCCEEDED') {
      return { order: claim.order, result: 'EXISTING' };
    }
    if (claim.outcome === 'ALREADY_PROCESSING') {
      return { order: claim.order, result: 'PROCESSING' };
    }
    if (claim.outcome === 'ALREADY_FAILED') {
      throw new AppError(
        claim.order.failureCode ?? 'COURIER_REQUEST_REJECTED',
        'The previous shipment-creation attempt failed',
        422,
      );
    }
    if (claim.outcome === 'RECONCILIATION_REQUIRED') {
      throw new AppError(
        'SHIPMENT_STATE_UNKNOWN',
        'Shipment outcome is uncertain and requires reconciliation',
        503,
      );
    }

    try {
      const courierResult = await adapter.createShipment(normalizedInput);
      const order = await this.dependencies.orders.completeShipmentCreation(request.order_id, {
        courierShipmentId: courierResult.courierShipmentId,
        awbNumber: courierResult.awbNumber,
        courierRequest: toJsonValue(courierResult.requestPayload),
        courierResponse: toJsonValue(courierResult.responsePayload),
      });

      const occurredAt = this.clock();
      await this.dependencies.tracking.append({
        orderId: order.id,
        deduplicationKey: stableHash({
          status: courierResult.courierStatus,
          occurredAt: occurredAt.toISOString(),
        }),
        status: 'CREATED',
        courierStatus: courierResult.courierStatus,
        description: 'Shipment created',
        occurredAt,
        rawPayload: toJsonValue(courierResult.responsePayload),
      });

      return { order, result: 'CREATED' };
    } catch (error) {
      if (!(error instanceof CourierError)) throw error;
      await this.persistCourierFailure(request.order_id, error);
      throw publicErrorForCourierFailure(error);
    }
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.getRequiredOrder(orderId);
  }

  async trackOrder(orderId: string): Promise<TrackingOutcome> {
    let order = await this.getRequiredOrder(orderId);
    const reference = shipmentReference(order);
    const adapter = this.dependencies.couriers.get(order.courierPartner);

    try {
      const result = await adapter.trackShipment(reference);

      for (const event of result.events) {
        await this.appendCourierTrackingEvent(order.id, event);
      }

      if (
        !protectedTerminalStatuses.has(order.shipmentStatus) ||
        result.status === order.shipmentStatus
      ) {
        order = await this.dependencies.orders.updateShipmentStatus(orderId, result.status);
      }

      return {
        order,
        events: await this.dependencies.tracking.findByOrderId(order.id),
      };
    } catch (error) {
      if (error instanceof CourierError) throw publicErrorForCourierFailure(error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<Order> {
    const order = await this.getRequiredOrder(orderId);

    if (order.shipmentStatus === 'CANCELLED') return order;
    if (nonCancellableStatuses.has(order.shipmentStatus)) {
      throw new AppError(
        'SHIPMENT_NOT_CANCELLABLE',
        `Shipment in status ${order.shipmentStatus} cannot be cancelled`,
        409,
      );
    }

    const reference = shipmentReference(order);
    const adapter = this.dependencies.couriers.get(order.courierPartner);

    try {
      const result = await adapter.cancelShipment(reference);
      const cancelled = await this.dependencies.orders.updateShipmentStatus(orderId, 'CANCELLED');
      await this.dependencies.tracking.append({
        orderId: order.id,
        deduplicationKey: stableHash({
          status: result.courierStatus,
          occurredAt: result.cancelledAt.toISOString(),
        }),
        status: 'CANCELLED',
        courierStatus: result.courierStatus,
        description: 'Shipment cancelled',
        occurredAt: result.cancelledAt,
        rawPayload: toJsonValue(result.responsePayload),
      });
      return cancelled;
    } catch (error) {
      if (error instanceof CourierError) throw publicErrorForCourierFailure(error);
      throw error;
    }
  }

  private async getRequiredOrder(orderId: string): Promise<Order> {
    const order = await this.dependencies.orders.findByOrderId(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND', `Order '${orderId}' was not found`, 404);
    return order;
  }

  private async appendCourierTrackingEvent(
    databaseOrderId: string,
    event: CourierTrackingEvent,
  ): Promise<void> {
    await this.dependencies.tracking.append({
      orderId: databaseOrderId,
      ...(event.courierEventId ? { courierEventId: event.courierEventId } : {}),
      deduplicationKey: stableHash(
        event.courierEventId ?? {
          status: event.courierStatus,
          occurredAt: event.occurredAt.toISOString(),
          location: event.location ?? '',
        },
      ),
      status: event.status,
      courierStatus: event.courierStatus,
      ...(event.description ? { description: event.description } : {}),
      ...(event.location ? { location: event.location } : {}),
      occurredAt: event.occurredAt,
      rawPayload: toJsonValue(event.rawPayload),
    });
  }

  private async persistCourierFailure(orderId: string, error: CourierError): Promise<void> {
    await this.dependencies.orders.markProcessingFailure(orderId, {
      code: publicCodeForCourierFailure(error),
      details: toJsonValue(error.rawDetails ?? { kind: error.kind }),
      reconciliationRequired: error.kind === 'UNKNOWN_OUTCOME',
    });
  }
}

function shipmentReference(order: Order): {
  orderId: string;
  courierShipmentId: string;
  awbNumber: string;
} {
  if (!order.courierShipmentId || !order.awbNumber) {
    throw new AppError(
      'SHIPMENT_NOT_CREATED',
      'The order does not have a confirmed courier shipment',
      409,
    );
  }

  return {
    orderId: order.orderId,
    courierShipmentId: order.courierShipmentId,
    awbNumber: order.awbNumber,
  };
}

function publicErrorForCourierFailure(error: CourierError): AppError {
  const code = publicCodeForCourierFailure(error);
  const statusByKind = {
    REQUEST_REJECTED: 422,
    AUTHENTICATION_FAILED: 502,
    UNAVAILABLE: 503,
    UNKNOWN_OUTCOME: 503,
  } as const;
  const messageByKind = {
    REQUEST_REJECTED: 'The courier rejected the shipment request',
    AUTHENTICATION_FAILED: 'Courier authentication failed',
    UNAVAILABLE: 'The courier is temporarily unavailable',
    UNKNOWN_OUTCOME: 'Shipment outcome is uncertain and requires reconciliation',
  } as const;

  return new AppError(code, messageByKind[error.kind], statusByKind[error.kind], undefined, {
    cause: error,
  });
}

function publicCodeForCourierFailure(error: CourierError): string {
  const codeByKind = {
    REQUEST_REJECTED: 'COURIER_REQUEST_REJECTED',
    AUTHENTICATION_FAILED: 'COURIER_AUTHENTICATION_FAILED',
    UNAVAILABLE: 'COURIER_UNAVAILABLE',
    UNKNOWN_OUTCOME: 'SHIPMENT_STATE_UNKNOWN',
  } as const;
  return codeByKind[error.kind];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return toJsonCompatible(value) as Prisma.InputJsonValue;
}

function toJsonCompatible(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonCompatible);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        toJsonCompatible(item),
      ]),
    );
  }
  return null;
}
