import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { CourierRegistry } from '../../src/modules/couriers/courier-registry.js';
import { MockCourierAdapter } from '../../src/modules/couriers/mock/mock-courier.adapter.js';
import { ServiceabilityService } from '../../src/modules/serviceability/serviceability.service.js';

const serviceabilityService = new ServiceabilityService(
  new CourierRegistry([new MockCourierAdapter({ serviceablePincodes: ['122001', '560001'] })]),
);
const app = createApp({
  logger: pino({ level: 'silent' }),
  serviceabilityService,
  defaultCourierPartner: 'mock',
});

describe('pincode serviceability API', () => {
  it('returns one normalized availability result per requested pincode', async () => {
    const response = await request(app).get(
      '/api/v1/serviceability/pincodes?courier_partner=mock&pincodes=122001,122017,560001',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        courier_partner: 'mock',
        results: [
          { pincode: '122001', available: true },
          { pincode: '122017', available: false },
          { pincode: '560001', available: true },
        ],
      },
    });
  });

  it('uses the configured default courier when courier_partner is omitted', async () => {
    const response = await request(app).get(
      '/api/v1/serviceability/pincodes?pincodes=122001,560001',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { courier_partner: 'mock' } });
  });

  it('rejects malformed, duplicate, and unsupported courier queries', async () => {
    const malformed = await request(app).get(
      '/api/v1/serviceability/pincodes?courier_partner=mock&pincodes=122001,bad',
    );
    const duplicate = await request(app).get(
      '/api/v1/serviceability/pincodes?courier_partner=mock&pincodes=122001,122001',
    );
    const unknownCourier = await request(app).get(
      '/api/v1/serviceability/pincodes?courier_partner=missing&pincodes=122001',
    );

    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(unknownCourier.status).toBe(400);
    expect(unknownCourier.body).toMatchObject({ error: { code: 'UNSUPPORTED_COURIER' } });
  });
});
