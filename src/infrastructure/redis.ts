import IORedis from 'ioredis';

export type RedisClient = IORedis;

export function createRedisClient(
  url: string,
  name: string,
  maxRetriesPerRequest: number | null = 1,
): RedisClient {
  return new IORedis(url, {
    connectionName: name,
    enableReadyCheck: true,
    maxRetriesPerRequest,
  });
}

export async function checkRedisHealth(client: RedisClient): Promise<void> {
  const response = await client.ping();
  if (response !== 'PONG') throw new Error('Redis health check returned an unexpected response');
}

export async function closeRedisClient(client: RedisClient): Promise<void> {
  await client.quit();
}
