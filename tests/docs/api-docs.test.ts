import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const app = createApp({ logger: pino({ level: 'silent' }) });

describe('API documentation', () => {
  it('serves the OpenAPI contract with every public path', async () => {
    const response = await request(app).get('/api-docs/openapi.json');
    const document = response.body as unknown as {
      openapi: string;
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths).sort()).toEqual(
      [
        '/api/v1/batches/{batchId}',
        '/api/v1/orders',
        '/api/v1/orders/bulk',
        '/api/v1/orders/{orderId}',
        '/api/v1/orders/{orderId}/cancel',
        '/api/v1/orders/{orderId}/track',
        '/health/live',
        '/health/ready',
      ].sort(),
    );
  });

  it('serves an interactive Swagger UI with a route-specific CSP', async () => {
    const response = await request(app).get('/api-docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>EaseCommerce Courier API</title>');
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it('contains only resolvable local references and unique operation IDs', async () => {
    const response = await request(app).get('/api-docs/openapi.json');
    const document = response.body as unknown as Record<string, unknown>;
    const references = collectValues(document, '$ref');
    const operationIds = collectValues(document, 'operationId');

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference.startsWith('#/')).toBe(true);
      expect(resolveLocalReference(document, reference)).toBeDefined();
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });
});

function collectValues(value: unknown, targetKey: string): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectValues(item, targetKey));
  if (typeof value !== 'object' || value === null) return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    key === targetKey && typeof item === 'string' ? [item] : collectValues(item, targetKey),
  );
}

function resolveLocalReference(document: Record<string, unknown>, reference: string): unknown {
  return reference
    .slice(2)
    .split('/')
    .reduce<unknown>((current, segment) => {
      if (typeof current !== 'object' || current === null) return undefined;
      return (current as Record<string, unknown>)[segment];
    }, document);
}
