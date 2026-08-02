import { createHash } from 'node:crypto';
import type { ShipmentStatus } from '../../../shared/domain/shipment.js';
import { CourierError } from '../courier-error.js';
import type {
  CancelShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  CourierPayload,
  ShipmentReference,
  TrackingEvent,
  TrackingResult,
} from '../courier.types.js';

export function toUrbaneBoltManifest(
  input: CreateShipmentInput,
  customerCode: string,
): Array<Record<string, unknown>> {
  return [
    {
      customerCode,
      orderNumber: input.orderId,
      declaredValue: input.payment.declaredValue,
      itemDescription: input.package.itemDescription,
      collectableValue: input.payment.collectableAmount,
      height: input.package.heightCm,
      length: input.package.lengthCm,
      pieces: input.package.pieces,
      weight: input.package.weightKg,
      breadth: input.package.widthCm,
      serviceType: input.serviceLevel === 'SAME_DAY' ? 'SDD' : 'NDD',
      payMode: input.payment.mode === 'PREPAID' ? 'PPD' : 'COD',
      ...addressFields('rtn', input.returnAddress),
      ...addressFields('cons', input.consignee),
      ...addressFields('shpr', input.shipper),
      invoiceNumber: input.invoice.number,
      invoiceDate: input.invoice.date,
      invoiceValue: input.invoice.value,
      itemQuantity: input.package.itemQuantity,
    },
  ];
}

export function fromUrbaneBoltManifestResponse(
  response: CourierPayload,
  requestPayload: CourierPayload,
): CreateShipmentResult {
  const result = unwrapResponseRecord(response);
  const awbNumber = firstString(result, ['awb', 'awbNumber', 'awb_no', 'waybill']);

  if (!awbNumber) {
    throw new CourierError(
      'UNKNOWN_OUTCOME',
      'UrbaneBolt manifest response did not contain an AWB',
      false,
      response,
    );
  }

  const courierShipmentId =
    firstString(result, ['shipmentId', 'shipment_id', 'orderId', 'order_id', 'id']) ?? awbNumber;
  const courierStatus = firstString(result, ['status', 'shipmentStatus']) ?? 'CREATED';

  return {
    courierShipmentId,
    awbNumber,
    status: mapUrbaneBoltStatus(courierStatus),
    courierStatus,
    requestPayload,
    responsePayload: response,
  };
}

export function fromUrbaneBoltTrackingResponse(response: CourierPayload): TrackingResult {
  const root = unwrapResponseRecord(response);
  const courierStatus =
    firstString(root, ['status', 'shipmentStatus', 'current_status']) ?? 'UNKNOWN';
  const history = firstArray(root, ['history', 'travelHistory', 'trackingHistory', 'scans']);
  const events = (history ?? [root]).map(toTrackingEvent);

  return {
    status: mapUrbaneBoltStatus(courierStatus),
    courierStatus,
    events,
    rawPayload: response,
  };
}

export function fromUrbaneBoltCancellationResponse(
  reference: ShipmentReference,
  response: CourierPayload,
  cancelledAt: Date,
): CancelShipmentResult {
  const result = unwrapResponseRecord(response);

  if (result.success === false) {
    throw new CourierError(
      'REQUEST_REJECTED',
      'UrbaneBolt rejected the cancellation',
      false,
      response,
    );
  }

  return {
    status: 'CANCELLED',
    courierStatus: firstString(result, ['status', 'shipmentStatus']) ?? 'CANCELLED',
    cancelledAt,
    requestPayload: { awbs: reference.awbNumber },
    responsePayload: response,
  };
}

export function mapUrbaneBoltStatus(rawStatus: string): ShipmentStatus {
  const status = rawStatus.trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');

  if (containsAny(status, ['RTO_DELIVERED', 'RETURNED_TO_ORIGIN'])) return 'RETURNED';
  if (containsAny(status, ['RTO', 'RETURN_TO_ORIGIN'])) return 'RTO_INITIATED';
  if (containsAny(status, ['OUT_FOR_DELIVERY', 'OFD'])) return 'OUT_FOR_DELIVERY';
  if (containsAny(status, ['DELIVERED'])) return 'DELIVERED';
  if (containsAny(status, ['PICKED_UP', 'PICKUP_COMPLETE'])) return 'PICKED_UP';
  if (containsAny(status, ['IN_TRANSIT', 'REACHED_HUB', 'DEPARTED_HUB'])) return 'IN_TRANSIT';
  if (containsAny(status, ['CANCELLED', 'CANCELED'])) return 'CANCELLED';
  if (containsAny(status, ['LOST', 'DAMAGED', 'DISPOSED'])) return 'FAILED';
  if (containsAny(status, ['CREATED', 'BOOKED', 'MANIFESTED'])) return 'CREATED';
  return 'UNKNOWN';
}

function addressFields(
  prefix: 'rtn' | 'cons' | 'shpr',
  address: CreateShipmentInput['consignee'],
): Record<string, unknown> {
  return {
    [`${prefix}Name`]: address.name,
    [`${prefix}Mobile`]: domesticPhoneNumber(address.phone),
    [`${prefix}Email`]: address.email ?? '',
    [`${prefix}Address`]: [address.addressLine1, address.addressLine2].filter(Boolean).join(', '),
    [`${prefix}AddressType`]: titleCase(address.addressType),
    [`${prefix}City`]: address.city,
    [`${prefix}State`]: address.state,
    [`${prefix}Country`]: 'INDIA',
    [`${prefix}Pincode`]: Number(address.postalCode),
  };
}

function domesticPhoneNumber(phone: string): number {
  const digits = phone.replaceAll(/\D/g, '');
  const domesticDigits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return Number(domesticDigits);
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function toTrackingEvent(value: unknown): TrackingEvent {
  const event = asRecord(value) ?? {};
  const courierStatus =
    firstString(event, ['status', 'shipmentStatus', 'current_status']) ?? 'UNKNOWN';
  const occurredAt = parseDate(
    firstString(event, ['occurred_at', 'eventTime', 'timestamp', 'date', 'updated_at']),
  );
  const location = firstString(event, ['location', 'city', 'hub']);
  const description = firstString(event, ['description', 'remarks', 'message']);
  const rawPayload = event;

  return {
    courierEventId:
      firstString(event, ['eventId', 'event_id', 'id']) ?? eventFingerprint(event, occurredAt),
    status: mapUrbaneBoltStatus(courierStatus),
    courierStatus,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    occurredAt,
    rawPayload,
  };
}

function unwrapResponseRecord(payload: CourierPayload): Record<string, unknown> {
  const rootValue = Array.isArray(payload) ? payload[0] : payload;
  const root = asRecord(rootValue) ?? {};
  const dataValue = root.data;

  if (Array.isArray(dataValue)) return asRecord(dataValue[0]) ?? root;
  return asRecord(dataValue) ?? root;
}

function firstArray(record: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as unknown[];
  }
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function eventFingerprint(event: Record<string, unknown>, occurredAt: Date): string {
  return createHash('sha256')
    .update(JSON.stringify(event))
    .update(occurredAt.toISOString())
    .digest('hex');
}

function containsAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}
