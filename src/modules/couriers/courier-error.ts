export const courierErrorKinds = [
  'REQUEST_REJECTED',
  'AUTHENTICATION_FAILED',
  'UNAVAILABLE',
  'UNKNOWN_OUTCOME',
] as const;

export type CourierErrorKind = (typeof courierErrorKinds)[number];

export class CourierError extends Error {
  constructor(
    public readonly kind: CourierErrorKind,
    message: string,
    public readonly retryable: boolean,
    public readonly rawDetails?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CourierError';
  }
}
