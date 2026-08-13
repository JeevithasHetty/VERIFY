import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { getRedisConnection } from '../config/redis.js';

let queueInstance;

export function getImageQueue() {
  if (queueInstance) return queueInstance;

  queueInstance = new Queue(env.queue.name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: env.queue.attempts,
      backoff: {
        type: 'exponential',
        delay: env.queue.backoffMs,
      },
      removeOnComplete: { age: 60 * 60 * 24 }, // keep 24h for debugging
      removeOnFail: false, // keep failed jobs for inspection/retry
    },
  });

  return queueInstance;
}

/**
 * Enqueues a job to process a single uploaded image.
 * The job name and queue name are intentionally fixed constants so
 * the worker can subscribe deterministically.
 */
export async function enqueueImageProcessing(processingId, options = {}) {
  const queue = getImageQueue();
  const jobId = options.jobId || processingId;
  return queue.add(
    env.queue.jobName,
    { processingId },
    { jobId }
  );
}

export default { getImageQueue, enqueueImageProcessing };
