import { describe, expect, it } from 'vitest';
import type { CourierError } from '../../src/modules/couriers/courier-error.js';
import { MockCourierAdapter } from '../../src/modules/couriers/mock/mock-courier.adapter.js';
import { fixedTime, shipment } from '../fixtures/shipment.js';

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
