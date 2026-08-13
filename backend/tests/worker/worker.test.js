import sharp from 'sharp';
import { connectDB, disconnectDB } from '../../src/config/db.js';
import { getRedisConnection } from '../../src/config/redis.js';
import { Image } from '../../src/models/Image.js';
import { AnalysisResult } from '../../src/models/AnalysisResult.js';
import { getStorageService } from '../../src/services/storage/storageService.js';
import { generateProcessingId } from '../../src/utils/ids.js';
import { sha256, computeDHash } from '../../src/utils/hash.js';
import { processImage } from '../../src/workers/imageWorker.js';

/**
 * WORKER TESTS - require a real MongoDB connection (processImage reads
 * and writes Image/AnalysisResult documents directly; it does not go
 * through BullMQ here, so Redis is not required for this file, only
 * for the queue itself). See README "Testing" for how to run these
 * with `docker compose up -d`.
 */
let dbAvailable = true;
try {
  await connectDB();
} catch (err) {
  dbAvailable = false;
}

afterAll(async () => {
  if (dbAvailable) {
    await Image.deleteMany({ originalName: /^worker-test-/ });
    await AnalysisResult.deleteMany({});
    await disconnectDB();
  }
  const redis = getRedisConnection();
  await redis.quit();
});

const maybe = () => (dbAvailable ? describe : describe.skip);

if (!dbAvailable) {
  // eslint-disable-next-line no-console
  console.warn('[worker.test.js] MongoDB unreachable - skipping worker integration tests.');
}

async function seedImage(filename = 'worker-test-vehicle.jpg') {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 100, g: 140, b: 90 } } })
    .jpeg()
    .toBuffer();

  const storage = getStorageService();
  const processingId = generateProcessingId();
  const { filePath, storageUrl } = await storage.save(buffer, `${processingId}.jpg`);

  const image = await Image.create({
    processingId,
    originalName: filename,
    mimeType: 'image/jpeg',
    size: buffer.length,
    filePath,
    storageUrl,
    sha256: sha256(buffer),
    perceptualHash: await computeDHash(buffer),
    width: 640,
    height: 480,
    status: 'pending',
  });

  return image;
}

maybe()('imageWorker.processImage', () => {
  test('a successful job transitions the image to completed and writes an AnalysisResult', async () => {
    const image = await seedImage();
    const result = await processImage(image.processingId);

    expect(result.processingId).toBe(image.processingId);
    expect(typeof result.overallScore).toBe('number');
    expect(['ACCEPT', 'REVIEW', 'REJECT']).toContain(result.recommendation);

    const updated = await Image.findOne({ processingId: image.processingId });
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBeTruthy();

    const analysis = await AnalysisResult.findOne({ processingId: image.processingId });
    expect(analysis).toBeTruthy();
    expect(analysis.timeline.length).toBeGreaterThan(0);
    expect(analysis.timeline[0].stage).toBe('worker_started');
    expect(analysis.timeline.at(-1).stage).toBe('completed');
  }, 30000);

  test('processing a non-existent processingId throws (unrecoverable failure)', async () => {
    await expect(processImage('fv_DOES_NOT_EXIST')).rejects.toThrow();
  });

  test('re-processing the same image a second time detects itself as an exact duplicate of nothing new (idempotent re-run is safe)', async () => {
    const image = await seedImage('worker-test-rerun.jpg');
    await processImage(image.processingId);
    // Running again should not throw, and should still resolve to a result.
    const second = await processImage(image.processingId);
    expect(second.processingId).toBe(image.processingId);
  }, 30000);
});
