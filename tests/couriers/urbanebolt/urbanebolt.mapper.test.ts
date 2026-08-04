import { describe, expect, it } from 'vitest';
import {
  fromUrbaneBoltCancellationResponse,
  fromUrbaneBoltManifestResponse,
  fromUrbaneBoltTrackingResponse,
  mapUrbaneBoltStatus,
  toUrbaneBoltManifest,
} from '../../../src/modules/couriers/urbanebolt/urbanebolt.mapper.js';
import { fixedTime, shipment } from '../../fixtures/shipment.js';

describe('UrbaneBolt mapper', () => {
  it('maps the normalized order to the documented Manifest API contract', () => {
    const request = toUrbaneBoltManifest(shipment, 'UEB-TEST');

    expect(request).toHaveLength(1);
    expect(request[0]).toMatchObject({
      customerCode: 'UEB-TEST',
      orderNumber: 'EC-MOCK-001',
      serviceType: 'NDD',
      payMode: 'COD',
      breadth: 15,
      consName: 'Aarav Sharma',
      consMobile: 9876543210,
      consPincode: 560001,
      shprName: 'EaseCommerce Warehouse',
      rtnName: 'EaseCommerce Warehouse',
      invoiceNumber: 'INV-001',
    });
  });

  it('extracts shipment identifiers from a manifest response fixture', () => {
    const request = toUrbaneBoltManifest(shipment, 'UEB-TEST');
    const response = {
      data: [{ shipmentId: 'UB-1001', awb: '200000001170', status: 'MANIFESTED' }],
    };

    expect(fromUrbaneBoltManifestResponse(response, request)).toMatchObject({
      courierShipmentId: 'UB-1001',
      awbNumber: '200000001170',
      status: 'CREATED',
      courierStatus: 'MANIFESTED',
    });
  });

  it('extracts the AWB from the observed UrbaneBolt successResponse shape', () => {
    const request = toUrbaneBoltManifest(shipment, 'UEB-TEST');
    const response = {
      status: 'Success',
      errorResponse: [],
      successResponse: [
        {
          status: 'Success',
          awbNumber: 200000007161,
          routeCode: 'INR/BLRH',
          orderNumber: shipment.orderId,
          customerCode: 'UEB-TEST',
        },
      ],
    };

    expect(fromUrbaneBoltManifestResponse(response, request)).toMatchObject({
      courierShipmentId: '200000007161',
      awbNumber: '200000007161',
      status: 'CREATED',
      courierStatus: 'Success',
    });
  });

  it('normalizes tracking history and preserves unknown statuses', () => {
    const result = fromUrbaneBoltTrackingResponse({
      data: {
        current_status: 'IN TRANSIT',
        history: [
          {
            event_id: 'evt-1',
            status: 'PICKED UP',
            timestamp: '2026-08-03T10:00:00.000Z',
            location: 'Gurugram',
          },
          {
            event_id: 'evt-2',
            status: 'A NEW COURIER STATUS',
            timestamp: '2026-08-03T11:00:00.000Z',
          },
        ],
      },
    });

    expect(result.status).toBe('IN_TRANSIT');
    expect(result.events.map((event) => event.status)).toEqual(['PICKED_UP', 'UNKNOWN']);
  });

  it('maps cancellation and rejects an explicit unsuccessful response', () => {
    const reference = {
      orderId: shipment.orderId,
      courierShipmentId: 'UB-1001',
      awbNumber: '200000001170',
    };

    expect(
      fromUrbaneBoltCancellationResponse(reference, { success: true }, fixedTime),
    ).toMatchObject({ status: 'CANCELLED', cancelledAt: fixedTime });

    expect(() =>
      fromUrbaneBoltCancellationResponse(reference, { success: false }, fixedTime),
    ).toThrow('UrbaneBolt rejected the cancellation');
  });

  it.each([
    ['OUT FOR DELIVERY', 'OUT_FOR_DELIVERY'],
    ['RTO DELIVERED', 'RETURNED'],
    ['Damaged', 'FAILED'],
    ['Unrecognized status', 'UNKNOWN'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(mapUrbaneBoltStatus(raw)).toBe(expected);
  });
});
