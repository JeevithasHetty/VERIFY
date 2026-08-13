import sharp from 'sharp';
import { Image } from '../models/Image.js';
import { AnalysisResult } from '../models/AnalysisResult.js';
import { generateProcessingId } from '../utils/ids.js';
import { sha256, computeDHash } from '../utils/hash.js';
import { getStorageService } from '../services/storage/storageService.js';
import { enqueueImageProcessing } from '../queues/imageQueue.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const storage = getStorageService();

async function validateAndDescribeImage(buffer, originalMime) {
  // Confirms the payload is actually a decodable image (not just an
  // extension/MIME string), and extracts intrinsic dimensions.
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('no dimensions');
    }
    return metadata;
  } catch (err) {
    throw new AppError(
      `Uploaded file is not a valid, decodable ${originalMime} image`,
      400,
      'INVALID_IMAGE'
    );
  }
}

function buildFilename(processingId, originalName) {
  const ext = (originalName.split('.').pop() || 'jpg').toLowerCase();
  return `${processingId}.${ext}`;
}

async function createImageRecord({ file, idempotencyKey, batchId }) {
  // Idempotency: if a key was supplied and already used, return the
  // existing record instead of creating a duplicate job.
  if (idempotencyKey) {
    const existing = await Image.findOne({ idempotencyKey });
    if (existing) {
      return { image: existing, reused: true };
    }
  }

  const metadata = await validateAndDescribeImage(file.buffer, file.mimetype);
  const processingId = generateProcessingId();
  const filename = buildFilename(processingId, file.originalname);

  const { filePath, storageUrl } = await storage.save(file.buffer, filename);
  const hash = sha256(file.buffer);
  const perceptualHash = await computeDHash(file.buffer);

  const image = await Image.create({
    processingId,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    filePath,
    storageUrl,
    sha256: hash,
    perceptualHash,
    width: metadata.width,
    height: metadata.height,
    status: 'pending',
    idempotencyKey: idempotencyKey || undefined,
    batchId: batchId || undefined,
    createdAt: new Date(),
  });

  await enqueueImageProcessing(processingId);

  logger.info(
    { event: 'upload_received', processingId, size: file.size, mimeType: file.mimetype },
    'Image accepted for processing'
  );

  return { image, reused: false };
}

export async function uploadImage(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('No image file was provided. Use the "image" form field.', 400, 'NO_FILE');
    }

    const idempotencyKey = req.header('Idempotency-Key') || undefined;
    const { image, reused } = await createImageRecord({ file: req.file, idempotencyKey });

    res.status(202).json({
      processingId: image.processingId,
      status: image.status,
      message: reused
        ? 'Idempotent request: returning existing processing ID'
        : 'Image accepted for asynchronous processing',
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadBatch(req, res, next) {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      throw new AppError('No image files were provided. Use the "images" form field.', 400, 'NO_FILES');
    }
    if (files.length > env.upload.maxBatchSize) {
      throw new AppError(
        `Batch exceeds maximum of ${env.upload.maxBatchSize} images`,
        400,
        'BATCH_TOO_LARGE'
      );
    }

    const batchId = generateProcessingId().replace('fv_', 'batch_');
    const results = [];

    for (const file of files) {
      const { image } = await createImageRecord({ file, batchId });
      results.push({ processingId: image.processingId, status: image.status });
    }

    res.status(202).json({ total: results.length, batchId, images: results });
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    res.json({
      processingId: image.processingId,
      status: image.status,
      currentStage: image.currentStage,
      attempts: image.attempts,
      createdAt: image.createdAt,
      startedAt: image.startedAt,
      completedAt: image.completedAt,
      failedAt: image.failedAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function getResults(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    if (image.status !== 'completed') {
      return res.status(200).json({
        processingId: image.processingId,
        status: image.status,
        message: 'Results are not yet available. Poll the status endpoint until status=completed.',
      });
    }

    const result = await AnalysisResult.findOne({ processingId });
    if (!result) throw new AppError('Result record missing for completed image', 500);

    res.json({
      processingId: image.processingId,
      status: image.status,
      imageUrl: image.storageUrl,
      quality: result.quality,
      ocr: result.ocr,
      duplicate: result.duplicate,
      metadata: result.metadata,
      screenshot: result.screenshot,
      photoOfPhoto: result.photoOfPhoto,
      tampering: result.tampering,
      vehicle: result.vehicle,
      aiReview: result.aiReview,
      scores: result.scores,
      issues: result.issues,
      recommendation: result.recommendation,
      riskLevel: result.riskLevel,
      explanation: result.explanation,
      timeline: result.timeline,
      metrics: result.metrics,
    });
  } catch (err) {
    next(err);
  }
}

export async function getError(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    res.json({
      processingId: image.processingId,
      status: image.status,
      attempts: image.attempts,
      error: image.error || null,
      failedAt: image.failedAt || null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFile(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    if (env.storage.provider === 'mongodb') {
      const ok = await storage.stream(image.filePath, res);
      if (!ok) throw new AppError('Stored image not found', 404, 'FILE_NOT_FOUND');
      return;
    }

    if (env.storage.provider === 'local') {
      return res.sendFile(image.filePath);
    }

    return res.redirect(image.storageUrl);
  } catch (err) {
    next(err);
  }
}

export async function getTimeline(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    const result = await AnalysisResult.findOne({ processingId });
    res.json({ processingId, timeline: result?.timeline || [] });
  } catch (err) {
    next(err);
  }
}

export async function getMetrics(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    const result = await AnalysisResult.findOne({ processingId });
    res.json({ processingId, metrics: result?.metrics || {} });
  } catch (err) {
    next(err);
  }
}

export async function retryImage(req, res, next) {
  try {
    const { processingId } = req.params;
    const image = await Image.findOne({ processingId });
    if (!image) throw new AppError('Unknown processing ID', 404, 'NOT_FOUND');

    if (image.status !== 'failed') {
      throw new AppError(
        `Only failed jobs can be retried (current status: ${image.status})`,
        400,
        'INVALID_STATE'
      );
    }

    image.status = 'pending';
    image.error = undefined;
    image.failedAt = undefined;
    await image.save();

    await enqueueImageProcessing(processingId, { jobId: `${processingId}-retry-${Date.now()}` });

    logger.info({ event: 'retry_requested', processingId }, 'Retry requested');

    res.status(202).json({
      processingId: image.processingId,
      status: image.status,
      message: 'Image requeued for processing',
    });
  } catch (err) {
    next(err);
  }
}

export default {
  uploadImage,
  uploadBatch,
  getStatus,
  getResults,
  getError,
  getFile,
  getTimeline,
  getMetrics,
  retryImage,
};
