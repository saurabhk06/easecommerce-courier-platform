import type { AxiosInstance } from 'axios';
import { CourierError } from '../courier-error.js';
import { withRetry, type RetryOptions } from '../../../shared/retry.js';

type UrbaneBoltCredentials = {
  username: string;
  password: string;
};

type AuthProviderOptions = UrbaneBoltCredentials & {
  retry: Pick<RetryOptions, 'retries' | 'baseDelayMs'>;
  sleep?: RetryOptions['sleep'];
  random?: RetryOptions['random'];
};

export class UrbaneBoltAuthProvider {
  private token: string | undefined;
  private pendingAuthentication: Promise<string> | undefined;

  constructor(
    private readonly transport: AxiosInstance,
    private readonly options: AuthProviderOptions,
  ) {}

  async getToken(): Promise<string> {
    if (this.token) return this.token;
    if (this.pendingAuthentication) return this.pendingAuthentication;

    this.pendingAuthentication = this.authenticate();

    try {
      this.token = await this.pendingAuthentication;
      return this.token;
    } finally {
      this.pendingAuthentication = undefined;
    }
  }

  invalidate(): void {
    this.token = undefined;
  }

  private async authenticate(): Promise<string> {
    try {
      const response = await withRetry(
        () =>
          this.transport.post<unknown>('/api/v1/auth/getToken/', {
            username: this.options.username,
            password: this.options.password,
          }),
        {
          ...this.options.retry,
          shouldRetry: isTransientAxiosFailure,
          ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
          ...(this.options.random ? { random: this.options.random } : {}),
        },
      );

      const token = extractToken(response.data);
      if (!token) {
        throw new CourierError(
          'AUTHENTICATION_FAILED',
          'UrbaneBolt authentication response did not contain a token',
          false,
          response.data,
        );
      }

      return token;
    } catch (error) {
      if (error instanceof CourierError) throw error;
      throw new CourierError(
        'AUTHENTICATION_FAILED',
        'Unable to authenticate with UrbaneBolt',
        false,
        axiosErrorDetails(error),
        { cause: error },
      );
    }
  }
}

function extractToken(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const data = asRecord(root?.data);

  return (
    firstString(root, ['token', 'access_token', 'access']) ??
    firstString(data, ['token', 'access_token', 'access'])
  );
}

function isTransientAxiosFailure(error: unknown): boolean {
  const details = axiosErrorDetails(error);
  return details.status === undefined || details.status === 429 || details.status >= 500;
}

function axiosErrorDetails(error: unknown): { status?: number; data?: unknown; code?: string } {
  if (!isAxiosLikeError(error)) return {};

  return {
    ...(typeof error.response?.status === 'number' ? { status: error.response.status } : {}),
    ...(error.response?.data !== undefined ? { data: error.response.data } : {}),
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
  };
}

type AxiosLikeError = {
  code?: unknown;
  response?: { status?: unknown; data?: unknown };
};

function isAxiosLikeError(error: unknown): error is AxiosLikeError {
  return typeof error === 'object' && error !== null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}
