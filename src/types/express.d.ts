declare global {
  namespace Express {
    interface Locals {
      requestId: string;
      validatedBody?: unknown;
      validatedQuery?: unknown;
    }
  }
}

export {};
