import type { CourierPayload, PincodeAvailabilityResult } from '../courier.types.js';

const pincodeKeys = ['pincode', 'pinCode', 'postalCode', 'postal_code'];
const availabilityKeys = ['serviceable', 'isServiceable', 'available', 'is_active', 'active'];

export function fromUrbaneBoltPincodeResponse(
  payload: CourierPayload,
  requestedPincodes: string[],
): PincodeAvailabilityResult {
  const entries = extractEntries(payload);

  return {
    results: requestedPincodes.map((pincode) => ({
      pincode,
      available: isPincodeAvailable(payload, entries, pincode),
    })),
    rawPayload: payload,
  };
}

function isPincodeAvailable(payload: CourierPayload, entries: unknown[], pincode: string): boolean {
  const keyedValue = findKeyedValue(payload, pincode);
  if (keyedValue !== undefined) return availabilityFromValue(keyedValue, true);

  const match = entries.find((entry) => pincodeFromValue(entry) === pincode);
  return match === undefined ? false : availabilityFromValue(match, true);
}

function extractEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];

  for (const key of ['data', 'results', 'pincodes']) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
    if (asRecord(nested)) return extractEntries(nested);
  }
  return [];
}

function findKeyedValue(value: unknown, pincode: string): unknown {
  const record = asRecord(value);
  if (!record) return undefined;
  if (record[pincode] !== undefined) return record[pincode];

  for (const key of ['data', 'results', 'pincodes']) {
    const match = findKeyedValue(record[key], pincode);
    if (match !== undefined) return match;
  }
  return undefined;
}

function pincodeFromValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const record = asRecord(value);
  if (!record) return undefined;

  for (const key of pincodeKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate);
    }
  }
  return undefined;
}

function availabilityFromValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (['true', 'yes', 'y', '1', 'active', 'serviceable'].includes(value.toLowerCase()))
      return true;
    if (['false', 'no', 'n', '0', 'inactive', 'unserviceable'].includes(value.toLowerCase())) {
      return false;
    }
  }

  const record = asRecord(value);
  if (!record) return fallback;
  for (const key of availabilityKeys) {
    if (record[key] !== undefined) return availabilityFromValue(record[key], fallback);
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
