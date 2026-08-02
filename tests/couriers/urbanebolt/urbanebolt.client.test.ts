import axios, { AxiosError, type AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { UrbaneBoltClient } from '../../../src/modules/couriers/urbanebolt/urbanebolt.client.js';
import type { UrbaneBoltAuthProvider } from '../../../src/modules/couriers/urbanebolt/urbanebolt.auth.js';

describe('UrbaneBoltClient', () => {
  it('refreshes authentication and replays the original request once', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(axiosFailure(401, { detail: 'expired' }))
      .mockResolvedValueOnce({ data: { awb: '200000001170' } });
    const invalidate = vi.fn();
    const auth = {
      getToken: vi.fn().mockResolvedValueOnce('expired-token').mockResolvedValueOnce('fresh-token'),
      invalidate,
    } as unknown as UrbaneBoltAuthProvider;
    const client = new UrbaneBoltClient({ request } as unknown as AxiosInstance, auth, {
      retries: 0,
      baseDelayMs: 1,
    });

    await expect(
      client.request({ method: 'GET', path: '/tracking', params: { awb: '200000001170' } }),
    ).resolves.toEqual({ awb: '200000001170' });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ headers: { Authorization: 'Bearer fresh-token' } }),
    );
  });

  it('retries transient failures with backoff before succeeding', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(axiosFailure(500))
      .mockRejectedValueOnce(axiosFailure(429))
      .mockResolvedValueOnce({ data: { ok: true } });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const auth = {
      getToken: vi.fn().mockResolvedValue('token'),
      invalidate: vi.fn(),
    } as unknown as UrbaneBoltAuthProvider;
    const client = new UrbaneBoltClient({ request } as unknown as AxiosInstance, auth, {
      retries: 2,
      baseDelayMs: 100,
      sleep,
      random: () => 0,
    });

    await expect(client.request({ method: 'GET', path: '/tracking' })).resolves.toEqual({
      ok: true,
    });
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('marks a network failure during shipment creation as an unknown outcome', async () => {
    const request = vi.fn().mockRejectedValue(axiosFailure(undefined, undefined, 'ECONNRESET'));
    const auth = {
      getToken: vi.fn().mockResolvedValue('token'),
      invalidate: vi.fn(),
    } as unknown as UrbaneBoltAuthProvider;
    const client = new UrbaneBoltClient({ request } as unknown as AxiosInstance, auth, {
      retries: 0,
      baseDelayMs: 1,
    });

    await expect(
      client.request({
        method: 'POST',
        path: '/manifest',
        data: [],
        unknownOutcomeOnNetworkFailure: true,
      }),
    ).rejects.toMatchObject({ kind: 'UNKNOWN_OUTCOME', retryable: false });
  });
});

function axiosFailure(status?: number, data?: unknown, code?: string): AxiosError {
  return new AxiosError(
    'Request failed',
    code,
    undefined,
    undefined,
    status === undefined
      ? undefined
      : {
          status,
          statusText: 'Error',
          headers: {},
          config: { headers: new axios.AxiosHeaders() },
          data,
        },
  );
}
