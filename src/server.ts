import 'dotenv/config';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';

const env = parseEnvironment(process.env);
const logger = createLogger(env.LOG_LEVEL);
const app = createApp({ logger });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API server started');
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown started');

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server failed to close cleanly');
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
