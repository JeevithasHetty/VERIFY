import dotenv from 'dotenv';

dotenv.config();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function list(value, fallback) {
  if (!value) return fallback;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  apiBasePath: process.env.API_BASE_PATH || '/api/v1',

  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldverify',

  redis: {
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    localDir: process.env.LOCAL_STORAGE_DIR || 'uploads',
  },

  upload: {
    maxSizeMb: num(process.env.MAX_UPLOAD_SIZE_MB, 10),
    maxBatchSize: num(process.env.MAX_BATCH_SIZE, 10),
    allowedMimeTypes: list(process.env.ALLOWED_MIME_TYPES, [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
  },

  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxRequests: num(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  },

  queue: {
    name: process.env.QUEUE_NAME || 'image-processing',
    jobName: 'process-image',
    attempts: num(process.env.JOB_ATTEMPTS, 3),
    backoffMs: num(process.env.JOB_BACKOFF_MS, 2000),
  },

  thresholds: {
    blurVariance: num(process.env.BLUR_VARIANCE_THRESHOLD, 55),
    lowLightBrightness: num(process.env.LOW_LIGHT_BRIGHTNESS_THRESHOLD, 45),
    overexposedBrightness: num(process.env.OVEREXPOSED_BRIGHTNESS_THRESHOLD, 225),
    lowContrast: num(process.env.LOW_CONTRAST_THRESHOLD, 25),
    minWidth: num(process.env.MIN_WIDTH, 480),
    minHeight: num(process.env.MIN_HEIGHT, 360),
    unusualAspectRatioMin: num(process.env.UNUSUAL_ASPECT_RATIO_MIN, 0.4),
    unusualAspectRatioMax: num(process.env.UNUSUAL_ASPECT_RATIO_MAX, 2.6),
    nearDuplicateHamming: num(process.env.NEAR_DUPLICATE_HAMMING_THRESHOLD, 10),
  },

  plateRegex: process.env.PLATE_REGEX || '^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$',

  scoring: {
    acceptThreshold: num(process.env.ACCEPT_THRESHOLD, 85),
    reviewThreshold: num(process.env.REVIEW_THRESHOLD, 60),
  },

  aiReview: {
    enabled: bool(process.env.AI_REVIEW_ENABLED, false),
    triggerScore: num(process.env.AI_REVIEW_TRIGGER_SCORE, 80),
    apiKey: process.env.AI_PROVIDER_API_KEY || '',
    baseUrl: process.env.AI_PROVIDER_BASE_URL || '',
    model: process.env.AI_PROVIDER_MODEL || '',
  },

  runWorkerInApi: bool(process.env.RUN_WORKER_IN_API, false),

  logLevel: process.env.LOG_LEVEL || 'info',
};

export default env;
