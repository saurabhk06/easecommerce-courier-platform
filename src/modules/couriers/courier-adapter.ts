import type {
  CancelShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  ShipmentReference,
  TrackingResult,
} from './courier.types.js';

export interface CourierAdapter {
  readonly name: string;

  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  trackShipment(reference: ShipmentReference): Promise<TrackingResult>;
  cancelShipment(reference: ShipmentReference): Promise<CancelShipmentResult>;
}
