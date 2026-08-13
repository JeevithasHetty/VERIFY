import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { startWorker } from './workers/imageWorker.js';

async function start() {
  try {
    await connectDB();
    const app = createApp();

    if (env.runWorkerInApi) {
      startWorker();
      logger.info({ event: 'embedded_worker_started' }, 'BullMQ worker running inside the API service for single-service deployment');
    }

    const server = app.listen(env.port, () => {
      logger.info(
        { event: 'server_started', port: env.port, env: env.nodeEnv },
        `FieldVerify API listening on port ${env.port}`
      );
    });

    const shutdown = async (signal) => {
      logger.info({ event: 'shutdown_initiated', signal }, 'Shutting down gracefully');
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ event: 'startup_failed', error: err.message }, 'Failed to start server');
    process.exit(1);
  }
}

start();
