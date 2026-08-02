import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/shared/errors/app-error.js';
import type { CourierAdapter } from '../../src/modules/couriers/courier-adapter.js';
import { CourierRegistry } from '../../src/modules/couriers/courier-registry.js';
import { MockCourierAdapter } from '../../src/modules/couriers/mock/mock-courier.adapter.js';

describe('CourierRegistry', () => {
  it('returns a registered adapter by its public identifier', () => {
    const adapter = new MockCourierAdapter();
    const registry = new CourierRegistry([adapter]);

    expect(registry.get('mock')).toBe(adapter);
    expect(registry.supportedCouriers()).toEqual(['mock']);
  });

  it('reports supported couriers for an unknown identifier', () => {
    const registry = new CourierRegistry([new MockCourierAdapter()]);

    expect(() => registry.get('missing')).toThrowError(AppError);

    try {
      registry.get('missing');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'UNSUPPORTED_COURIER',
        statusCode: 400,
        details: [{ field: 'courier_partner', message: 'Supported couriers: mock' }],
      });
    }
  });

  it('rejects duplicate adapter registrations during application composition', () => {
    const first = new MockCourierAdapter();
    const duplicate = { ...first, name: 'mock' } as unknown as CourierAdapter;
    const registry = new CourierRegistry([first]);

    expect(() => registry.register(duplicate)).toThrowError(
      "Courier adapter 'mock' is already registered",
    );
  });
});
