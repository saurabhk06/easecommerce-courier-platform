import pino, { type Logger } from 'pino';

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
];

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: redactedPaths,
      censor: '[REDACTED]',
    },
  });
}
