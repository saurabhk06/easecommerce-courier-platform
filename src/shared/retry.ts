export type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  shouldRetry: (error: unknown) => boolean;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.retries || !options.shouldRetry(error)) throw error;

      const exponentialDelay = options.baseDelayMs * 2 ** attempt;
      const jitter = Math.floor(random() * options.baseDelayMs);
      await sleep(exponentialDelay + jitter);
    }
  }
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
