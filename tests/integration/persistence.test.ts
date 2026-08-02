import {
  BatchStatus,
  PrismaClient,
  ProcessingStatus,
  ServiceLevel,
  ShipmentStatus,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BatchRepository } from '../../src/modules/batches/batch.repository.js';
import { OrderRepository } from '../../src/modules/orders/order.repository.js';
import { TrackingRepository } from '../../src/modules/orders/tracking.repository.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.includes('localhost')) {
  throw new Error('Integration tests require an explicit local DATABASE_URL');
}

const database = new PrismaClient({ datasourceUrl: databaseUrl });
const orders = new OrderRepository(database);
const tracking = new TrackingRepository(database);
const batches = new BatchRepository(database);

const baseOrder = {
  orderId: 'EC-TEST-001',
  requestFingerprint: 'a'.repeat(64),
  courierPartner: 'mock',
  serviceLevel: ServiceLevel.NEXT_DAY,
  normalizedRequest: {
    order_id: 'EC-TEST-001',
    courier_partner: 'mock',
    service_level: 'NEXT_DAY',
  },
};

describe('persistence foundation', () => {
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

  it('creates one order under concurrent idempotent submissions', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => orders.createOrGet(baseOrder)),
    );

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.order.id))).toHaveLength(1);
    await expect(database.order.count()).resolves.toBe(1);
  });

  it('allows only one concurrent processing claim', async () => {
    await orders.createOrGet(baseOrder);

    const claims = await Promise.all(
      Array.from({ length: 10 }, () => orders.claimForProcessing(baseOrder.orderId)),
    );

    expect(claims.filter((claim) => claim?.outcome === 'CLAIMED')).toHaveLength(1);
    expect(claims.filter((claim) => claim?.outcome === 'ALREADY_PROCESSING')).toHaveLength(9);
  });

  it('deduplicates tracking events and prevents audit-history mutation', async () => {
    const { order } = await orders.createOrGet(baseOrder);
    const input = {
      orderId: order.id,
      courierEventId: 'mock-event-1',
      deduplicationKey: 'b'.repeat(64),
      status: ShipmentStatus.CREATED,
      courierStatus: 'BOOKED',
      description: 'Shipment booked',
      location: 'Gurugram',
      occurredAt: new Date('2026-08-03T10:00:00.000Z'),
      rawPayload: { status: 'BOOKED' },
    };

    const first = await tracking.append(input);
    const duplicate = await tracking.append(input);

    expect(first.appended).toBe(true);
    expect(duplicate.appended).toBe(false);
    await expect(database.trackingEvent.count()).resolves.toBe(1);

    await expect(
      database.$executeRaw`UPDATE "tracking_history" SET "courier_status" = 'CHANGED' WHERE "id" = ${first.event.id}::uuid`,
    ).rejects.toThrow(/append-only/);

    await expect(
      database.$executeRaw`DELETE FROM "tracking_history" WHERE "id" = ${first.event.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('calculates a partially completed batch from persisted order outcomes', async () => {
    const batch = await batches.create(2);
    const successfulOrder = await orders.createOrGet({
      ...baseOrder,
      batchId: batch.id,
    });
    const failedOrder = await orders.createOrGet({
      ...baseOrder,
      orderId: 'EC-TEST-002',
      requestFingerprint: 'c'.repeat(64),
      normalizedRequest: { ...baseOrder.normalizedRequest, order_id: 'EC-TEST-002' },
      batchId: batch.id,
    });

    await database.order.update({
      where: { id: successfulOrder.order.id },
      data: { processingStatus: ProcessingStatus.SUCCEEDED },
    });
    await database.order.update({
      where: { id: failedOrder.order.id },
      data: { processingStatus: ProcessingStatus.FAILED },
    });

    const summary = await batches.refreshSummary(batch.id);

    expect(summary).toMatchObject({
      status: BatchStatus.PARTIALLY_COMPLETED,
      totalCount: 2,
      successCount: 1,
      failureCount: 1,
    });
  });
});
