import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const logger = pino({ level: 'silent' });

describe('application foundation', () => {
  it('reports liveness and returns a request ID', async () => {
    const response = await request(createApp({ logger })).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('preserves a caller-provided request ID', async () => {
    const response = await request(createApp({ logger }))
      .get('/health/live')
      .set('x-request-id', 'hr-demo-request');

    expect(response.headers['x-request-id']).toBe('hr-demo-request');
  });

  it('reports readiness failure when a dependency check fails', async () => {
    const unavailableDependency = async () => {
      await Promise.resolve();
      throw new Error('unavailable');
    };

    const response = await request(
      createApp({ logger, readinessChecks: [unavailableDependency] }),
    ).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
  });

  it('uses the normalized error shape for unknown routes', async () => {
    const response = await request(createApp({ logger })).get('/missing');
    const body = response.body as {
      error: { code: string; message: string; request_id: string };
    };

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: 'ROUTE_NOT_FOUND',
      message: 'Route GET /missing was not found',
    });
    expect(body.error.request_id).toBeTypeOf('string');
  });
});
