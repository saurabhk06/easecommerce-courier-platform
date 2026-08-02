export type ErrorDetail = {
  field?: string;
  message: string;
};

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: ErrorDetail[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
