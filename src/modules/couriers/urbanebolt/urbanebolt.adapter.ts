import type { CourierAdapter } from '../courier-adapter.js';
import type {
  CancelShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  CourierPayload,
  ShipmentReference,
  TrackingResult,
} from '../courier.types.js';
import type { UrbaneBoltApiClient } from './urbanebolt.client.js';
import {
  fromUrbaneBoltCancellationResponse,
  fromUrbaneBoltManifestResponse,
  fromUrbaneBoltTrackingResponse,
  toUrbaneBoltManifest,
} from './urbanebolt.mapper.js';

type UrbaneBoltAdapterOptions = {
  customerCode: string;
  clock?: () => Date;
};

export class UrbaneBoltAdapter implements CourierAdapter {
  readonly name = 'urbanebolt';

  private readonly clock: () => Date;

  constructor(
    private readonly client: UrbaneBoltApiClient,
    private readonly options: UrbaneBoltAdapterOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const requestPayload = toUrbaneBoltManifest(input, this.options.customerCode);
    const response = await this.client.request<CourierPayload>({
      method: 'POST',
      path: '/api/v1/services/manifest/',
      data: requestPayload,
      unknownOutcomeOnNetworkFailure: true,
    });

    return fromUrbaneBoltManifestResponse(response, requestPayload);
  }

  async trackShipment(reference: ShipmentReference): Promise<TrackingResult> {
    const response = await this.client.request<CourierPayload>({
      method: 'GET',
      path: '/api/v1/services/tracking-pub/',
      params: { awb: reference.awbNumber },
    });

    return fromUrbaneBoltTrackingResponse(response);
  }

  async cancelShipment(reference: ShipmentReference): Promise<CancelShipmentResult> {
    const response = await this.client.request<CourierPayload>({
      method: 'POST',
      path: '/api/v1/services/cancel/',
      data: { awbs: reference.awbNumber },
    });

    return fromUrbaneBoltCancellationResponse(reference, response, this.clock());
  }
}
