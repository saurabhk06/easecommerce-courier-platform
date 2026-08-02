import type { Environment } from '../../config/env.js';
import { CourierRegistry } from './courier-registry.js';
import { MockCourierAdapter } from './mock/mock-courier.adapter.js';
import { createUrbaneBoltAdapter } from './urbanebolt/create-urbanebolt-adapter.js';

export function createCourierRegistry(env: Environment): CourierRegistry {
  return new CourierRegistry([new MockCourierAdapter(), createUrbaneBoltAdapter(env)]);
}
