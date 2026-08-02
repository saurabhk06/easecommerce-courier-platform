import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { UrbaneBoltAuthProvider } from '../../../src/modules/couriers/urbanebolt/urbanebolt.auth.js';

describe('UrbaneBoltAuthProvider', () => {
  it('shares one authentication request across concurrent callers and caches the token', async () => {
    const post = vi.fn().mockResolvedValue({ data: { token: 'uat-token' } });
    const transport = { post } as unknown as AxiosInstance;
    const auth = new UrbaneBoltAuthProvider(transport, {
      username: 'test-user',
      password: 'test-password',
      retry: { retries: 0, baseDelayMs: 1 },
    });

    const tokens = await Promise.all([auth.getToken(), auth.getToken(), auth.getToken()]);
    const cachedToken = await auth.getToken();

    expect(tokens).toEqual(['uat-token', 'uat-token', 'uat-token']);
    expect(cachedToken).toBe('uat-token');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('authenticates again after invalidation', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { token: 'first-token' } })
      .mockResolvedValueOnce({ data: { data: { access_token: 'second-token' } } });
    const auth = new UrbaneBoltAuthProvider({ post } as unknown as AxiosInstance, {
      username: 'test-user',
      password: 'test-password',
      retry: { retries: 0, baseDelayMs: 1 },
    });

    await expect(auth.getToken()).resolves.toBe('first-token');
    auth.invalidate();
    await expect(auth.getToken()).resolves.toBe('second-token');
    expect(post).toHaveBeenCalledTimes(2);
  });
});
