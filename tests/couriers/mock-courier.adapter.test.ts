import { describe, expect, it } from 'vitest';
import type { CourierError } from '../../src/modules/couriers/courier-error.js';
import { MockCourierAdapter } from '../../src/modules/couriers/mock/mock-courier.adapter.js';
import type { CreateShipmentInput } from '../../src/modules/couriers/courier.types.js';

const fixedTime = new Date('2026-08-03T12:00:00.000Z');

const shipment: CreateShipmentInput = {
  orderId: 'EC-MOCK-001',
  serviceLevel: 'NEXT_DAY',
  consignee: {
    name: 'Aarav Sharma',
    phone: '+919876543210',
    addressLine1: '12 MG Road',
    addressType: 'HOME',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'IN',
    postalCode: '560001',
  },
  shipper: {
    name: 'EaseCommerce Warehouse',
    phone: '+919811111111',
    addressLine1: 'Plot 18, Sector 17',
    addressType: 'BUSINESS',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'IN',
    postalCode: '122001',
  },
  returnAddress: {
    name: 'EaseCommerce Warehouse',
    phone: '+919811111111',
    addressLine1: 'Plot 18, Sector 17',
    addressType: 'BUSINESS',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'IN',
    postalCode: '122001',
  },
  package: {
    weightKg: 1.25,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
    pieces: 1,
    itemDescription: 'Cotton shirts',
    itemQuantity: 2,
  },
  payment: {
    mode: 'COD',
    collectableAmount: 1499,
    declaredValue: 1499,
  },
  invoice: {
    number: 'INV-001',
    date: '2026-08-03',
    value: 1499,
  },
};

describe('MockCourierAdapter', () => {
  it('creates deterministic courier identifiers for idempotent demonstrations', async () => {
    const adapter = new MockCourierAdapter({ clock: () => fixedTime });

    const first = await adapter.createShipment(shipment);
    const second = await adapter.createShipment(shipment);

    expect(first).toEqual(second);
    expect(first.courierShipmentId).toMatch(/^MOCK-\d{11}$/);
    expect(first.awbNumber).toMatch(/^9\d{11}$/);
    expect(first.status).toBe('CREATED');
    expect(first.courierStatus).toBe('BOOKED');
  });

  it('returns normalized tracking and cancellation results', async () => {
    const adapter = new MockCourierAdapter({ clock: () => fixedTime });
    const created = await adapter.createShipment(shipment);
    const reference = {
      orderId: shipment.orderId,
      courierShipmentId: created.courierShipmentId,
      awbNumber: created.awbNumber,
    };

    const tracking = await adapter.trackShipment(reference);
    const cancellation = await adapter.cancelShipment(reference);

    expect(tracking).toMatchObject({
      status: 'IN_TRANSIT',
      events: [{ status: 'IN_TRANSIT', occurredAt: fixedTime }],
    });
    expect(cancellation).toMatchObject({
      status: 'CANCELLED',
      cancelledAt: fixedTime,
    });
  });

  it('supports controlled permanent rejection without order-service branching', async () => {
    const adapter = new MockCourierAdapter({ shouldReject: () => true });

    await expect(adapter.createShipment(shipment)).rejects.toMatchObject({
      name: 'CourierError',
      kind: 'REQUEST_REJECTED',
      retryable: false,
    } satisfies Partial<CourierError>);
  });
});
