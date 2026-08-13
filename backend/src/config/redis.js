import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let connection;

/**
 * BullMQ requires maxRetriesPerRequest: null on the ioredis connection
 * it uses for blocking operations.
 */
export function getRedisConnection() {
  if (connection) return connection;

  connection = env.redis.url
    ? new IORedis(env.redis.url, { maxRetriesPerRequest: null })
    : new IORedis({
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password,
        maxRetriesPerRequest: null,
      });

  connection.on('connect', () => {
    logger.info({ event: 'redis_connected' }, 'Redis connected');
  });

  connection.on('error', (err) => {
    logger.error(
      {
        event: 'redis_error',
        message: err.message || '(no message)',
        code: err.code,
        errno: err.errno,
        address: err.address,
        port: err.port,
        host: env.redis.host,
        configuredPort: env.redis.port,
      },
      'Redis connection error'
    );
  });

  return connection;
}

export default getRedisConnection;
