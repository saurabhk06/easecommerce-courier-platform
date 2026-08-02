import { describe, expect, it } from 'vitest';
import { fromUrbaneBoltPincodeResponse } from '../../../src/modules/couriers/urbanebolt/urbanebolt.serviceability.mapper.js';

describe('UrbaneBolt pincode response mapper', () => {
  it('normalizes record arrays and marks omitted pincodes unavailable', () => {
    const payload = {
      data: [
        { pincode: 122001, isServiceable: true },
        { pinCode: '122017', active: false },
      ],
    };

    expect(fromUrbaneBoltPincodeResponse(payload, ['122001', '122017', '560001']).results).toEqual([
      { pincode: '122001', available: true },
      { pincode: '122017', available: false },
      { pincode: '560001', available: false },
    ]);
  });

  it('supports keyed and scalar-list response shapes without exposing them publicly', () => {
    expect(
      fromUrbaneBoltPincodeResponse(
        { results: { '122001': true, '122017': { serviceable: 'no' } } },
        ['122001', '122017'],
      ).results,
    ).toEqual([
      { pincode: '122001', available: true },
      { pincode: '122017', available: false },
    ]);

    expect(
      fromUrbaneBoltPincodeResponse({ pincodes: [122001, '560001'] }, ['122001', '560001']).results,
    ).toEqual([
      { pincode: '122001', available: true },
      { pincode: '560001', available: true },
    ]);
  });
});
