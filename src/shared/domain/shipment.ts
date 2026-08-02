export const serviceLevels = ['SAME_DAY', 'NEXT_DAY'] as const;
export type ServiceLevel = (typeof serviceLevels)[number];

export const shipmentStatuses = [
  'PENDING',
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RTO_INITIATED',
  'RETURNED',
  'FAILED',
  'UNKNOWN',
] as const;

export type ShipmentStatus = (typeof shipmentStatuses)[number];
