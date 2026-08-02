import type { CourierAdapter } from './courier-adapter.js';
import type { PincodeAvailabilityResult } from './courier.types.js';

export interface ServiceabilityAdapter extends CourierAdapter {
  checkPincodeAvailability(pincodes: string[]): Promise<PincodeAvailabilityResult>;
}

export function supportsServiceability(adapter: CourierAdapter): adapter is ServiceabilityAdapter {
  return 'checkPincodeAvailability' in adapter;
}
