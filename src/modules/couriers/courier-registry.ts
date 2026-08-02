import { AppError } from '../../shared/errors/app-error.js';
import type { CourierAdapter } from './courier-adapter.js';

export class CourierRegistry {
  private readonly adapters = new Map<string, CourierAdapter>();

  constructor(adapters: CourierAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: CourierAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Courier adapter '${adapter.name}' is already registered`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): CourierAdapter {
    const adapter = this.adapters.get(name);
    if (adapter) return adapter;

    const supportedCouriers = this.supportedCouriers();
    throw new AppError('UNSUPPORTED_COURIER', `Courier partner '${name}' is not supported`, 400, [
      {
        field: 'courier_partner',
        message: `Supported couriers: ${supportedCouriers.join(', ') || 'none configured'}`,
      },
    ]);
  }

  supportedCouriers(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
