import { Worker } from 'bullmq';
import { fileURLToPath } from 'url';
import path from 'path';
import { env } from '../config/env.js';
import { getRedisConnection } from '../config/redis.js';
import { connectDB } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { Image } from '../models/Image.js';
import { AnalysisResult } from '../models/AnalysisResult.js';
import { getStorageService } from '../services/storage/storageService.js';

import { analyzeImageQuality } from '../services/analysis/imageQuality.js';
import { runOcr } from '../services/analysis/ocr.js';
import { analyzeMetadata } from '../services/analysis/metadata.js';
import { detectDuplicates } from '../services/analysis/duplicate.js';
import { detectScreenshot } from '../services/analysis/screenshot.js';
import { detectPhotoOfPhoto } from '../services/analysis/photoOfPhoto.js';
import { detectTampering } from '../services/analysis/tampering.js';
import { detectVehicleEvidence } from '../services/analysis/vehicle.js';
import { computeEvidenceScore } from '../services/analysis/scoring.js';
import { shouldTriggerAiReview, runAiReview } from '../services/analysis/aiReview.js';

const storage = getStorageService();

function addTimelineEvent(timeline, stage) {
  timeline.push({ stage, timestamp: new Date() });
}

/**
 * The full deterministic + optional-AI analysis pipeline for one image.
 * Every stage is wrapped so that a single stage's failure (e.g. OCR)
 * degrades gracefully into a low-confidence result rather than crashing
 * the whole job - the only things allowed to throw here are genuinely
 * unrecoverable errors (e.g. the file cannot be read at all).
 */
export async function processImage(processingId) {
  const timeline = [];
  const metrics = { stageDurations: {} };
  const overallStart = Date.now();

  addTimelineEvent(timeline, 'worker_started');

  const image = await Image.findOne({ processingId });
  if (!image) throw new Error(`Image record not found for ${processingId}`);

  image.status = 'processing';
  image.startedAt = new Date();
  image.currentStage = 'quality_analysis';
  await image.save();

  const buffer = await storage.read(image.filePath);

  // --- Image quality ---------------------------------------------------
  addTimelineEvent(timeline, 'quality_analysis_started');
  let t = Date.now();
  const quality = await analyzeImageQuality(buffer, image.width, image.height);
  metrics.stageDurations.quality = Date.now() - t;
  addTimelineEvent(timeline, 'quality_analysis_completed');

  // --- OCR ---------------------------------------------------------------
  image.currentStage = 'ocr';
  await image.save();
  addTimelineEvent(timeline, 'ocr_started');
  t = Date.now();
  const ocr = await runOcr(buffer);
  metrics.stageDurations.ocr = Date.now() - t;
  metrics.ocrDurationMs = metrics.stageDurations.ocr;
  addTimelineEvent(timeline, 'ocr_completed');
  if (ocr.failed) {
    logger.warn({ event: 'ocr_failed', processingId, error: ocr.error }, 'OCR failed, continuing pipeline');
  }

  // --- Metadata (EXIF) -----------------------------------------------------
  const metadata = await analyzeMetadata(buffer);

  // --- Duplicate detection -------------------------------------------------
  image.currentStage = 'duplicate_check';
  await image.save();
  addTimelineEvent(timeline, 'duplicate_check_started');
  t = Date.now();
  const duplicate = await detectDuplicates({
    processingId: image.processingId,
    sha256: image.sha256,
    perceptualHash: image.perceptualHash,
    batchId: image.batchId,
  });
  metrics.stageDurations.duplicate = Date.now() - t;
  addTimelineEvent(timeline, 'duplicate_check_completed');
  if (duplicate.detected) {
    logger.info({ event: 'duplicate_detected', processingId, type: duplicate.type }, 'Duplicate detected');
  }

  // --- Integrity signals (screenshot / photo-of-photo / tampering / vehicle)
  image.currentStage = 'integrity_analysis';
  await image.save();
  addTimelineEvent(timeline, 'integrity_analysis_started');
  t = Date.now();

  const screenshot = detectScreenshot({
    aspectRatio: quality.aspectRatio.ratio,
    ocrText: ocr.rawText,
    metadata,
  });
  const photoOfPhoto = detectPhotoOfPhoto({ contrast: quality.contrast, noise: quality.noise, metadata });
  const tampering = detectTampering({ metadata, quality });
  const vehicle = detectVehicleEvidence({ plateCandidates: ocr.candidates, plateDetected: ocr.plateDetected, quality });

  metrics.stageDurations.integrity = Date.now() - t;
  addTimelineEvent(timeline, 'integrity_analysis_completed');

  // --- Scoring -------------------------------------------------------------
  const scored = computeEvidenceScore({ quality, ocr, duplicate, screenshot, photoOfPhoto, tampering, vehicle });

  // --- Optional AI review ---------------------------------------------------
  let aiReview = null;
  const triggerAi = shouldTriggerAiReview({
    overallScoreSoFar: scored.scores.overall,
    ocrConfidence: ocr.confidence,
    hasSuspiciousSignals: screenshot.suspicious || photoOfPhoto.suspicious || tampering.suspicious,
  });

  if (triggerAi) {
    addTimelineEvent(timeline, 'ai_review_started');
    t = Date.now();
    aiReview = await runAiReview(buffer, { processingId, ocr, quality });
    metrics.stageDurations.aiReview = Date.now() - t;
    metrics.aiDurationMs = metrics.stageDurations.aiReview;
    addTimelineEvent(timeline, 'ai_review_completed');
  }

  addTimelineEvent(timeline, 'result_generated');
  addTimelineEvent(timeline, 'completed');

  metrics.totalProcessingMs = Date.now() - overallStart;
  metrics.queueWaitMs = image.startedAt.getTime() - image.createdAt.getTime();
  metrics.attempts = image.attempts + 1;

  await AnalysisResult.findOneAndUpdate(
    { processingId },
    {
      processingId,
      quality,
      ocr,
      duplicate,
      metadata,
      screenshot,
      photoOfPhoto,
      tampering,
      vehicle,
      aiReview,
      scores: scored.scores,
      issues: scored.issues,
      recommendation: scored.recommendation,
      riskLevel: scored.riskLevel,
      explanation: scored.explanation,
      timeline,
      metrics,
    },
    { upsert: true, new: true }
  );

  image.status = 'completed';
  image.currentStage = null;
  image.completedAt = new Date();
  image.attempts += 1;
  await image.save();

  return { processingId, overallScore: scored.scores.overall, recommendation: scored.recommendation };
}

export function startWorker() {
  logger.info(
    { event: 'worker_starting', queue: env.queue.name, redisHost: env.redis.host, redisPort: env.redis.port },
    `Starting FieldVerify worker for queue "${env.queue.name}" (Redis ${env.redis.host}:${env.redis.port})`
  );

  const worker = new Worker(
    env.queue.name,
    async (job) => {
      const { processingId } = job.data;
      const start = Date.now();
      logger.info({ event: 'job_started', processingId, jobId: job.id, attempt: job.attemptsMade + 1 }, 'Processing job');

      try {
        const result = await processImage(processingId);
        logger.info(
          { event: 'job_completed', processingId, duration: Date.now() - start, ...result },
          'Job completed'
        );
        return result;
      } catch (err) {
        logger.error(
          { event: 'job_failed', processingId, error: err.message, stack: err.stack, attempt: job.attemptsMade + 1 },
          'Job failed'
        );

        const attemptsExhausted = job.attemptsMade + 1 >= (job.opts.attempts || env.queue.attempts);
        await Image.findOneAndUpdate(
          { processingId },
          {
            $inc: { attempts: 1 },
            $set: {
              status: attemptsExhausted ? 'failed' : 'pending',
              error: { message: err.message, stage: 'processing' },
              ...(attemptsExhausted ? { failedAt: new Date() } : {}),
            },
          }
        );

        throw err; // let BullMQ handle retry/backoff bookkeeping
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    }
  );

  // Fires once the worker has actually established its Redis connection and
  // is subscribed to the queue - the definitive signal that it's live, as
  // opposed to just having been constructed.
  worker.on('ready', () => {
    logger.info(
      { event: 'worker_ready', queue: env.queue.name },
      `Worker is ready and listening on queue "${env.queue.name}"`
    );
  });

  worker.on('error', (err) => {
    logger.error({ event: 'worker_error', error: err.message }, 'Worker connection error');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { event: 'worker_job_failed', processingId: job?.data?.processingId, jobId: job?.id, error: err.message },
      'BullMQ reported job failure'
    );
  });

  return worker;
}

// Allow running as a standalone process: `node src/workers/imageWorker.js`
//
// This comparison must be robust across platforms. A naive
// `import.meta.url === 'file://' + process.argv[1]` breaks on Windows,
// because process.argv[1] uses backslashes (C:\Users\...) while
// import.meta.url is a percent-encoded forward-slash file URL
// (file:///C:/Users/...) - they can never be equal as raw strings.
//
// Converting import.meta.url back to a filesystem path with
// fileURLToPath, then normalizing both sides through path.resolve,
// compares them in the same representation on every OS.
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  connectDB()
    .then(() => {
      startWorker();
      logger.info({ event: 'worker_process_started' }, 'FieldVerify worker process started');
    })
    .catch((err) => {
      logger.error({ event: 'worker_startup_failed', error: err.message }, 'Worker failed to start');
      process.exit(1);
    });
}

export default { startWorker, processImage };
