import type { Environment } from '../../../config/env.js';
import { UrbaneBoltAdapter } from './urbanebolt.adapter.js';
import { UrbaneBoltAuthProvider } from './urbanebolt.auth.js';
import { createUrbaneBoltTransport, UrbaneBoltClient } from './urbanebolt.client.js';

export function createUrbaneBoltAdapter(env: Environment): UrbaneBoltAdapter {
  const transport = createUrbaneBoltTransport(env.URBANEBOLT_BASE_URL, env.COURIER_TIMEOUT_MS);
  const retry = {
    retries: env.COURIER_RETRY_COUNT,
    baseDelayMs: env.COURIER_RETRY_BASE_DELAY_MS,
  };
  const auth = new UrbaneBoltAuthProvider(transport, {
    username: env.URBANEBOLT_USERNAME,
    password: env.URBANEBOLT_PASSWORD,
    retry,
  });
  const client = new UrbaneBoltClient(transport, auth, retry);

  return new UrbaneBoltAdapter(client, { customerCode: env.URBANEBOLT_CUSTOMER_CODE });
}
