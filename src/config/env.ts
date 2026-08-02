import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.url(),
  BULK_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(50).default(5),
  BULK_JOB_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
  COURIER_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  COURIER_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(3),
  COURIER_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(250),
  URBANEBOLT_BASE_URL: z.url(),
  URBANEBOLT_USERNAME: z.string().min(1),
  URBANEBOLT_PASSWORD: z.string().min(1),
  URBANEBOLT_CUSTOMER_CODE: z.string().min(1),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const invalidFields = result.error.issues
      .map((issue) => issue.path.join('.'))
      .filter(Boolean)
      .join(', ');

    throw new Error(`Invalid environment configuration: ${invalidFields}`);
  }

  return result.data;
}
