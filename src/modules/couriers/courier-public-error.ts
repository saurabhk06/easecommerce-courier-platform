import { AppError } from '../../shared/errors/app-error.js';
import type { CourierError } from './courier-error.js';

export function toPublicCourierError(error: CourierError): AppError {
  const statusByKind = {
    REQUEST_REJECTED: 422,
    AUTHENTICATION_FAILED: 502,
    UNAVAILABLE: 503,
    UNKNOWN_OUTCOME: 503,
  } as const;
  const messageByKind = {
    REQUEST_REJECTED: 'The courier rejected the request',
    AUTHENTICATION_FAILED: 'Courier authentication failed',
    UNAVAILABLE: 'The courier is temporarily unavailable',
    UNKNOWN_OUTCOME: 'Shipment outcome is uncertain and requires reconciliation',
  } as const;

  return new AppError(
    courierFailureCode(error),
    messageByKind[error.kind],
    statusByKind[error.kind],
    undefined,
    { cause: error },
  );
}

export function courierFailureCode(error: CourierError): string {
  const codeByKind = {
    REQUEST_REJECTED: 'COURIER_REQUEST_REJECTED',
    AUTHENTICATION_FAILED: 'COURIER_AUTHENTICATION_FAILED',
    UNAVAILABLE: 'COURIER_UNAVAILABLE',
    UNKNOWN_OUTCOME: 'SHIPMENT_STATE_UNKNOWN',
  } as const;
  return codeByKind[error.kind];
}
