import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { CourierRegistry } from '../../src/modules/couriers/courier-registry.js';
import { CourierError } from '../../src/modules/couriers/courier-error.js';
import { MockCourierAdapter } from '../../src/modules/couriers/mock/mock-courier.adapter.js';
import { OrderRepository } from '../../src/modules/orders/order.repository.js';
import { OrderService } from '../../src/modules/orders/order.service.js';
import { TrackingRepository } from '../../src/modules/orders/tracking.repository.js';
import { createOrderRequest } from '../fixtures/order-request.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.includes('localhost')) {
  throw new Error('Integration tests require an explicit local DATABASE_URL');
}

const database = new PrismaClient({ datasourceUrl: databaseUrl });
const fixedTime = new Date('2026-08-03T12:00:00.000Z');
const orders = new OrderRepository(database);
const tracking = new TrackingRepository(database);
const mockCourier = new MockCourierAdapter({ clock: () => fixedTime, latencyMs: 25 });
const orderService = new OrderService({
  orders,
  tracking,
  couriers: new CourierRegistry([mockCourier]),
  clock: () => fixedTime,
});
const app = createApp({ logger: pino({ level: 'silent' }), orderService });

describe('unified order API', () => {
  beforeAll(async () => {
    await database.$connect();
  });

  beforeEach(async () => {
    await database.$executeRawUnsafe(
      'TRUNCATE TABLE "tracking_history", "orders", "batches" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it('creates, replays, retrieves, tracks and cancels one normalized shipment', async () => {
    const created = await request(app).post('/api/v1/orders').send(createOrderRequest);
    const replay = await request(app).post('/api/v1/orders').send(createOrderRequest);
    const retrieved = await request(app).get(`/api/v1/orders/${createOrderRequest.order_id}`);
    const firstTracking = await request(app).get(
      `/api/v1/orders/${createOrderRequest.order_id}/track`,
    );
    const repeatedTracking = await request(app).get(
      `/api/v1/orders/${createOrderRequest.order_id}/track`,
    );
    const cancellation = await request(app).post(
      `/api/v1/orders/${createOrderRequest.order_id}/cancel`,
    );
    const repeatedCancellation = await request(app).post(
      `/api/v1/orders/${createOrderRequest.order_id}/cancel`,
    );

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      data: {
        order_id: 'EC-API-001',
        courier_partner: 'mock',
        shipment_status: 'CREATED',
        processing_status: 'SUCCEEDED',
      },
    });
    expect(replay.status).toBe(200);
    expect(retrieved.status).toBe(200);
    expect(firstTracking.status).toBe(200);
    expect(firstTracking.body).toMatchObject({
      data: { shipment_status: 'IN_TRANSIT' },
    });
    expect(repeatedTracking.status).toBe(200);
    expect(cancellation.status).toBe(200);
    expect(cancellation.body).toMatchObject({ data: { shipment_status: 'CANCELLED' } });
    expect(repeatedCancellation.status).toBe(200);

    const savedOrder = await database.order.findUniqueOrThrow({
      where: { orderId: createOrderRequest.order_id },
    });
    expect(savedOrder.courierRequest).not.toBeNull();
    expect(savedOrder.courierResponse).not.toBeNull();
    await expect(database.order.count()).resolves.toBe(1);
    await expect(database.trackingEvent.count()).resolves.toBe(3);
  });

  it('rejects a reused order ID with a different payload', async () => {
    await request(app).post('/api/v1/orders').send(createOrderRequest);

    const conflict = await request(app)
      .post('/api/v1/orders')
      .send({
        ...createOrderRequest,
        package: { ...createOrderRequest.package, item_description: 'Different contents' },
      });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: { code: 'ORDER_ID_CONFLICT' } });
    await expect(database.order.count()).resolves.toBe(1);
  });

  it('returns field-level validation errors without creating an order', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .send({
        ...createOrderRequest,
        consignee: { ...createOrderRequest.consignee, postal_code: 'bad' },
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [
          {
            field: 'consignee.postal_code',
            message: 'Postal code must contain six digits',
          },
        ],
      },
    });
    await expect(database.order.count()).resolves.toBe(0);
  });

  it('returns supported couriers without persisting an unknown courier order', async () => {
    const response = await request(app)
      .post('/api/v1/orders')
      .send({ ...createOrderRequest, courier_partner: 'missing' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'UNSUPPORTED_COURIER',
        details: [{ field: 'courier_partner', message: 'Supported couriers: mock' }],
      },
    });
    await expect(database.order.count()).resolves.toBe(0);
  });

  it('allows only one courier call under concurrent identical submissions', async () => {
    const createShipment = vi.spyOn(mockCourier, 'createShipment');

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request(app).post('/api/v1/orders').send(createOrderRequest)),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.every((response) => [201, 202].includes(response.status))).toBe(true);
    expect(createShipment).toHaveBeenCalledOnce();
    await expect(database.order.count()).resolves.toBe(1);
    createShipment.mockRestore();
  });

  it('does not let a stale tracking response overwrite a terminal shipment state', async () => {
    await request(app).post('/api/v1/orders').send(createOrderRequest);
    await database.order.update({
      where: { orderId: createOrderRequest.order_id },
      data: { shipmentStatus: 'DELIVERED' },
    });

    const response = await request(app).get(`/api/v1/orders/${createOrderRequest.order_id}/track`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { shipment_status: 'DELIVERED' } });
    await expect(
      database.order.findUniqueOrThrow({ where: { orderId: createOrderRequest.order_id } }),
    ).resolves.toMatchObject({ shipmentStatus: 'DELIVERED' });
  });

  it('persists uncertain creation outcomes for reconciliation without leaking raw details', async () => {
    const uncertainCourier = new MockCourierAdapter();
    vi.spyOn(uncertainCourier, 'createShipment').mockRejectedValue(
      new CourierError('UNKNOWN_OUTCOME', 'connection reset', false, {
        upstream_secret: 'private-courier-diagnostic',
      }),
    );
    const uncertainService = new OrderService({
      orders,
      tracking,
      couriers: new CourierRegistry([uncertainCourier]),
    });
    const uncertainApp = createApp({
      logger: pino({ level: 'silent' }),
      orderService: uncertainService,
    });

    const response = await request(uncertainApp)
      .post('/api/v1/orders')
      .send({ ...createOrderRequest, order_id: 'EC-UNCERTAIN-001' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'SHIPMENT_STATE_UNKNOWN' } });
    expect(JSON.stringify(response.body)).not.toContain('private-courier-diagnostic');
    await expect(
      database.order.findUniqueOrThrow({ where: { orderId: 'EC-UNCERTAIN-001' } }),
    ).resolves.toMatchObject({
      processingStatus: 'RECONCILIATION_REQUIRED',
      failureCode: 'SHIPMENT_STATE_UNKNOWN',
      failureDetails: { upstream_secret: 'private-courier-diagnostic' },
    });
  });
});
