import type { CourierRegistry } from '../couriers/courier-registry.js';
import { CourierError } from '../couriers/courier-error.js';
import { toPublicCourierError } from '../couriers/courier-public-error.js';
import { supportsServiceability } from '../couriers/serviceability-adapter.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { PincodeAvailability } from '../couriers/courier.types.js';

export type ServiceabilityResult = {
  courierPartner: string;
  results: PincodeAvailability[];
};

export class ServiceabilityService {
  constructor(private readonly couriers: CourierRegistry) {}

  async checkPincodes(courierPartner: string, pincodes: string[]): Promise<ServiceabilityResult> {
    const adapter = this.couriers.get(courierPartner);
    if (!supportsServiceability(adapter)) {
      throw new AppError(
        'COURIER_CAPABILITY_UNSUPPORTED',
        `Courier '${courierPartner}' does not support pincode availability`,
        400,
      );
    }

    try {
      const availability = await adapter.checkPincodeAvailability(pincodes);
      return { courierPartner, results: availability.results };
    } catch (error) {
      if (error instanceof CourierError) throw toPublicCourierError(error);
      throw error;
    }
  }
}
