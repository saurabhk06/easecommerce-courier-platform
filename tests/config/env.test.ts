import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/env.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/courier_platform',
  REDIS_URL: 'redis://localhost:6379',
  URBANEBOLT_BASE_URL: 'https://uat.urbanebolt.in',
  URBANEBOLT_USERNAME: 'test-user',
  URBANEBOLT_PASSWORD: 'test-password',
  URBANEBOLT_CUSTOMER_CODE: 'TEST-CUSTOMER',
};

describe('parseEnvironment', () => {
  it('applies safe local defaults', () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      COURIER_TIMEOUT_MS: 5000,
      COURIER_RETRY_COUNT: 3,
      BULK_WORKER_CONCURRENCY: 5,
      BULK_JOB_ATTEMPTS: 3,
      DEFAULT_COURIER_PARTNER: 'urbanebolt',
    });
  });

  it('reports invalid configuration before the server starts', () => {
    expect(() => parseEnvironment({})).toThrowError(/DATABASE_URL, REDIS_URL, URBANEBOLT_BASE_URL/);
  });
});
