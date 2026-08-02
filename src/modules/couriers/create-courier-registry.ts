import { CourierRegistry } from './courier-registry.js';
import { MockCourierAdapter } from './mock/mock-courier.adapter.js';

export function createCourierRegistry(): CourierRegistry {
  return new CourierRegistry([new MockCourierAdapter()]);
}
