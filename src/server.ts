import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { Database } from './infrastructure/database.js';

const env = parseEnvironment(process.env);
const logger = createLogger(env.LOG_LEVEL);
const database = new Database();

let server: Server | undefined;
let isShuttingDown = false;

async function start(): Promise<void> {
  await database.connect();

  const app = createApp({
    logger,
    readinessChecks: [() => database.checkHealth()],
  });

  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API server started');
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown started');

  const forceShutdown = setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceShutdown.unref();

  try {
    await closeHttpServer(server);
    await database.disconnect();
    clearTimeout(forceShutdown);
    logger.info('Graceful shutdown completed');
  } catch (error) {
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  }
}

function closeHttpServer(httpServer: Server | undefined): Promise<void> {
  if (!httpServer) return Promise.resolve();

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API server failed to start');
  process.exit(1);
});
