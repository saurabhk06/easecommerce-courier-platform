import { createHash } from 'node:crypto';
import type { ServiceabilityAdapter } from '../serviceability-adapter.js';
import { CourierError } from '../courier-error.js';
import type {
  CancelShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  ShipmentReference,
  TrackingResult,
  PincodeAvailabilityResult,
} from '../courier.types.js';

type MockCourierOptions = {
  clock?: () => Date;
  latencyMs?: number;
  shouldReject?: (orderId: string) => boolean;
  serviceablePincodes?: string[];
};

export class MockCourierAdapter implements ServiceabilityAdapter {
  readonly name = 'mock';

  private readonly clock: () => Date;
  private readonly latencyMs: number;
  private readonly shouldReject: (orderId: string) => boolean;
  private readonly serviceablePincodes: Set<string>;

  constructor(options: MockCourierOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.latencyMs = options.latencyMs ?? 0;
    this.shouldReject = options.shouldReject ?? (() => false);
    this.serviceablePincodes = new Set(
      options.serviceablePincodes ?? ['122001', '122017', '560001'],
    );
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    await this.waitForConfiguredLatency();

    const requestPayload = {
      reference: input.orderId,
      service: input.serviceLevel,
      destination_postal_code: input.consignee.postalCode,
      weight_kg: input.package.weightKg,
    };

    if (this.shouldReject(input.orderId)) {
      throw new CourierError('REQUEST_REJECTED', 'MockCourier rejected the shipment', false, {
        code: 'MOCK_REJECTION',
        reference: input.orderId,
      });
    }

    const shipmentCode = stableShipmentCode(input.orderId);
    const responsePayload = {
      shipment_id: `MOCK-${shipmentCode}`,
      awb: `9${shipmentCode}`,
      status: 'BOOKED',
    };

    return {
      courierShipmentId: responsePayload.shipment_id,
      awbNumber: responsePayload.awb,
      status: 'CREATED',
      courierStatus: responsePayload.status,
      requestPayload,
      responsePayload,
    };
  }

  async trackShipment(reference: ShipmentReference): Promise<TrackingResult> {
    await this.waitForConfiguredLatency();

    const occurredAt = this.clock();
    const rawPayload = {
      awb: reference.awbNumber,
      status: 'IN_TRANSIT',
      location: 'MockCourier Hub',
      occurred_at: occurredAt.toISOString(),
    };

    return {
      status: 'IN_TRANSIT',
      courierStatus: rawPayload.status,
      rawPayload,
      events: [
        {
          courierEventId: `mock-${reference.awbNumber}-in-transit`,
          status: 'IN_TRANSIT',
          courierStatus: rawPayload.status,
          description: 'Shipment is moving through the MockCourier network',
          location: rawPayload.location,
          occurredAt,
          rawPayload,
        },
      ],
    };
  }

  async cancelShipment(reference: ShipmentReference): Promise<CancelShipmentResult> {
    await this.waitForConfiguredLatency();

    const cancelledAt = this.clock();
    const requestPayload = { awb: reference.awbNumber };
    const responsePayload = {
      awb: reference.awbNumber,
      status: 'CANCELLED',
      cancelled_at: cancelledAt.toISOString(),
    };

    return {
      status: 'CANCELLED',
      courierStatus: responsePayload.status,
      cancelledAt,
      requestPayload,
      responsePayload,
    };
  }

  async checkPincodeAvailability(pincodes: string[]): Promise<PincodeAvailabilityResult> {
    await this.waitForConfiguredLatency();
    const results = pincodes.map((pincode) => ({
      pincode,
      available: this.serviceablePincodes.has(pincode),
    }));

    return { results, rawPayload: { results } };
  }

  private async waitForConfiguredLatency(): Promise<void> {
    if (this.latencyMs === 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}

function stableShipmentCode(orderId: string): string {
  const digest = createHash('sha256').update(orderId).digest();
  const numericValue = digest.readUIntBE(0, 6) % 100_000_000_000;
  return numericValue.toString().padStart(11, '0');
}
