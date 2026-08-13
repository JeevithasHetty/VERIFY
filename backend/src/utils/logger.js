import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.logLevel || 'info',
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'req.headers.authorization',
      '*.apiKey',
      '*.password',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});

export default logger;
