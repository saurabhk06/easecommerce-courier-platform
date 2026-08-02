import { describe, expect, it, vi } from 'vitest';
import { UrbaneBoltAdapter } from '../../../src/modules/couriers/urbanebolt/urbanebolt.adapter.js';
import type { UrbaneBoltApiClient } from '../../../src/modules/couriers/urbanebolt/urbanebolt.client.js';
import { fixedTime, shipment } from '../../fixtures/shipment.js';

describe('UrbaneBoltAdapter', () => {
  it('uses the documented create, track and cancel endpoints behind one adapter contract', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ shipmentId: 'UB-1001', awb: '200000001170', status: 'MANIFESTED' }],
      })
      .mockResolvedValueOnce({
        data: {
          current_status: 'IN TRANSIT',
          history: [
            {
              event_id: 'evt-1',
              status: 'IN TRANSIT',
              timestamp: '2026-08-03T11:00:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({ success: true, status: 'CANCELLED' })
      .mockResolvedValueOnce({ data: [{ pincode: 122001, serviceable: true }] });
    const adapter = new UrbaneBoltAdapter({ request } as UrbaneBoltApiClient, {
      customerCode: 'UEB-TEST',
      clock: () => fixedTime,
    });

    const created = await adapter.createShipment(shipment);
    const reference = {
      orderId: shipment.orderId,
      courierShipmentId: created.courierShipmentId,
      awbNumber: created.awbNumber,
    };
    const tracking = await adapter.trackShipment(reference);
    const cancellation = await adapter.cancelShipment(reference);
    const availability = await adapter.checkPincodeAvailability(['122001', '560001']);

    expect(created).toMatchObject({ awbNumber: '200000001170', status: 'CREATED' });
    expect(tracking.status).toBe('IN_TRANSIT');
    expect(cancellation).toMatchObject({ status: 'CANCELLED', cancelledAt: fixedTime });
    expect(availability.results).toEqual([
      { pincode: '122001', available: true },
      { pincode: '560001', available: false },
    ]);

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/services/manifest/',
        unknownOutcomeOnNetworkFailure: true,
      }),
    );
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/api/v1/services/tracking-pub/',
      params: { awb: '200000001170' },
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: 'POST',
      path: '/api/v1/services/cancel/',
      data: { awbs: '200000001170' },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      method: 'GET',
      path: '/api/v1/location/pincodes/',
      params: { pincodes: '122001,560001' },
    });
  });
});
