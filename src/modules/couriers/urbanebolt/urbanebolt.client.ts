import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { withRetry, type RetryOptions } from '../../../shared/retry.js';
import { CourierError } from '../courier-error.js';
import type { UrbaneBoltAuthProvider } from './urbanebolt.auth.js';

export type UrbaneBoltRequest = {
  method: 'GET' | 'POST';
  path: string;
  params?: Record<string, string>;
  data?: unknown;
  unknownOutcomeOnNetworkFailure?: boolean;
};

export interface UrbaneBoltApiClient {
  request<T>(request: UrbaneBoltRequest): Promise<T>;
}

type ClientOptions = {
  retries: number;
  baseDelayMs: number;
  sleep?: RetryOptions['sleep'];
  random?: RetryOptions['random'];
};

export class UrbaneBoltClient implements UrbaneBoltApiClient {
  constructor(
    private readonly transport: AxiosInstance,
    private readonly auth: UrbaneBoltAuthProvider,
    private readonly options: ClientOptions,
  ) {}

  async request<T>(request: UrbaneBoltRequest): Promise<T> {
    let authenticationReplayUsed = false;

    for (;;) {
      const token = await this.auth.getToken();

      try {
        const response = await withRetry(() => this.send<T>(request, token), {
          retries: this.options.retries,
          baseDelayMs: this.options.baseDelayMs,
          shouldRetry: isTransientFailure,
          ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
          ...(this.options.random ? { random: this.options.random } : {}),
        });

        return response.data;
      } catch (error) {
        if (isAuthenticationFailure(error) && !authenticationReplayUsed) {
          authenticationReplayUsed = true;
          this.auth.invalidate();
          continue;
        }

        throw mapHttpError(error, request.unknownOutcomeOnNetworkFailure ?? false);
      }
    }
  }

  private send<T>(request: UrbaneBoltRequest, token: string): Promise<AxiosResponse<T>> {
    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.path,
      headers: { Authorization: `Bearer ${token}` },
      ...(request.params ? { params: request.params } : {}),
      ...(request.data !== undefined ? { data: request.data } : {}),
    };

    return this.transport.request<T>(config);
  }
}

export function createUrbaneBoltTransport(baseUrl: string, timeoutMs: number): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isTransientFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status === 429 || status >= 500;
}

function isAuthenticationFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
}

function mapHttpError(error: unknown, unknownOutcomeOnNetworkFailure: boolean): CourierError {
  if (error instanceof CourierError) return error;

  if (!axios.isAxiosError(error)) {
    return new CourierError('UNAVAILABLE', 'UrbaneBolt request failed', false, undefined, {
      cause: error,
    });
  }

  const status = error.response?.status;
  const rawDetails = {
    ...(status !== undefined ? { status } : {}),
    ...(error.code ? { code: error.code } : {}),
    ...(error.response?.data !== undefined ? { data: error.response.data as unknown } : {}),
  };

  if (status !== undefined && status >= 400 && status < 500) {
    const kind = [401, 403].includes(status) ? 'AUTHENTICATION_FAILED' : 'REQUEST_REJECTED';
    return new CourierError(kind, 'UrbaneBolt rejected the request', false, rawDetails, {
      cause: error,
    });
  }

  if (status === undefined && unknownOutcomeOnNetworkFailure) {
    return new CourierError(
      'UNKNOWN_OUTCOME',
      'UrbaneBolt may have accepted the request before the connection failed',
      false,
      rawDetails,
      { cause: error },
    );
  }

  return new CourierError(
    'UNAVAILABLE',
    'UrbaneBolt is temporarily unavailable',
    true,
    rawDetails,
    { cause: error },
  );
}
