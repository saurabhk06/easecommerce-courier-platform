import type { ShipmentStatus, ServiceLevel } from '../../shared/domain/shipment.js';

export type CourierPayload = Record<string, unknown> | Array<Record<string, unknown>>;

export type ContactAddress = {
  name: string;
  phone: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  addressType: 'HOME' | 'BUSINESS' | 'OTHER';
  city: string;
  state: string;
  country: 'IN';
  postalCode: string;
};

export type CreateShipmentInput = {
  orderId: string;
  serviceLevel: ServiceLevel;
  consignee: ContactAddress;
  shipper: ContactAddress;
  returnAddress: ContactAddress;
  package: {
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    pieces: number;
    itemDescription: string;
    itemQuantity: number;
  };
  payment: {
    mode: 'PREPAID' | 'COD';
    collectableAmount: number;
    declaredValue: number;
  };
  invoice: {
    number: string;
    date: string;
    value: number;
  };
};

export type ShipmentReference = {
  orderId: string;
  courierShipmentId: string;
  awbNumber: string;
};

export type CreateShipmentResult = {
  courierShipmentId: string;
  awbNumber: string;
  status: ShipmentStatus;
  courierStatus: string;
  requestPayload: CourierPayload;
  responsePayload: CourierPayload;
};

export type TrackingEvent = {
  courierEventId?: string;
  status: ShipmentStatus;
  courierStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
  rawPayload: CourierPayload;
};

export type TrackingResult = {
  status: ShipmentStatus;
  courierStatus: string;
  events: TrackingEvent[];
  rawPayload: CourierPayload;
};

export type CancelShipmentResult = {
  status: 'CANCELLED';
  courierStatus: string;
  cancelledAt: Date;
  requestPayload: CourierPayload;
  responsePayload: CourierPayload;
};
