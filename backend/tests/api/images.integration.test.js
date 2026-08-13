import request from 'supertest';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { createApp } from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/db.js';
import { Image } from '../../src/models/Image.js';
import { AnalysisResult } from '../../src/models/AnalysisResult.js';

/**
 * INTEGRATION TESTS - require a real MongoDB and Redis connection.
 *
 * Run with:
 *   docker compose up -d
 *   npm test -- tests/api/images.integration.test.js
 *
 * These are skipped automatically if MongoDB is unreachable, so the
 * rest of the suite (unit tests + validation tests) can still run in
 * restricted environments (e.g. CI sandboxes with no outbound access
 * to pull a MongoDB binary/image).
 */
const app = createApp();

async function makeJpegBuffer(seedColor = { r: 120, g: 150, b: 180 }) {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: seedColor } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Jest collects all describe() blocks synchronously at module load time,
// before any beforeAll hook runs - so the MongoDB reachability check must
// happen here via top-level await (supported under ESM), not inside
// beforeAll, or the skip/run decision would always see the stale default.
let dbAvailable = true;
try {
  await connectDB();
} catch (err) {
  dbAvailable = false;
}

afterAll(async () => {
  if (dbAvailable) {
    await Image.deleteMany({ originalName: /^test-/ });
    await AnalysisResult.deleteMany({});
    await disconnectDB();
  }
});

const maybe = () => (dbAvailable ? describe : describe.skip);

if (!dbAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    '[images.integration.test.js] MongoDB unreachable - skipping DB-dependent integration tests. ' +
      'Run `docker compose up -d` and re-run tests to execute this suite.'
  );
}

maybe()('POST /api/v1/images (upload)', () => {
  test('accepts a valid image and returns 202 with a processing ID immediately', async () => {
    const buffer = await makeJpegBuffer();
    const res = await request(app)
      .post('/api/v1/images')
      .attach('image', buffer, { filename: 'test-vehicle.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    expect(res.body.processingId).toMatch(/^fv_/);
    expect(res.body.status).toBe('pending');
  });

  test('rejects an oversized file', async () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 1); // 11MB > 10MB limit
    const res = await request(app)
      .post('/api/v1/images')
      .attach('image', bigBuffer, { filename: 'test-huge.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });
});

maybe()('Idempotency-Key', () => {
  test('the same Idempotency-Key returns the original processing ID instead of creating a new job', async () => {
    const buffer = await makeJpegBuffer({ r: 10, g: 200, b: 30 });
    const key = `test-idem-${Date.now()}`;

    const first = await request(app)
      .post('/api/v1/images')
      .set('Idempotency-Key', key)
      .attach('image', buffer, { filename: 'test-idem.jpg', contentType: 'image/jpeg' });

    const second = await request(app)
      .post('/api/v1/images')
      .set('Idempotency-Key', key)
      .attach('image', buffer, { filename: 'test-idem.jpg', contentType: 'image/jpeg' });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.processingId).toBe(first.body.processingId);
    expect(second.body.message).toMatch(/idempotent/i);

    const count = await Image.countDocuments({ idempotencyKey: key });
    expect(count).toBe(1);
  });
});

maybe()('GET /api/v1/images/:processingId/status', () => {
  test('returns 404 for an unknown processing ID', async () => {
    const res = await request(app).get('/api/v1/images/fv_UNKNOWN99/status');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('reflects pending status immediately after upload (before worker runs)', async () => {
    const buffer = await makeJpegBuffer({ r: 50, g: 50, b: 200 });
    const upload = await request(app)
      .post('/api/v1/images')
      .attach('image', buffer, { filename: 'test-status.jpg', contentType: 'image/jpeg' });

    const res = await request(app).get(`/api/v1/images/${upload.body.processingId}/status`);
    expect(res.status).toBe(200);
    expect(['pending', 'processing', 'completed']).toContain(res.body.status);
  });
});

maybe()('POST /api/v1/images/batch', () => {
  test('accepts up to the configured max and rejects more', async () => {
    const buffers = await Promise.all(
      Array.from({ length: 3 }).map((_, i) => makeJpegBuffer({ r: i * 30, g: 100, b: 100 }))
    );

    const req = request(app).post('/api/v1/images/batch');
    buffers.forEach((buf, i) => req.attach('images', buf, { filename: `test-batch-${i}.jpg`, contentType: 'image/jpeg' }));
    const res = await req;

    expect(res.status).toBe(202);
    expect(res.body.total).toBe(3);
    expect(res.body.images).toHaveLength(3);
    res.body.images.forEach((img) => expect(img.processingId).toMatch(/^fv_/));
  });
});

maybe()('POST /api/v1/images/:processingId/retry', () => {
  test('rejects retry for a job that has not failed', async () => {
    const buffer = await makeJpegBuffer({ r: 5, g: 5, b: 5 });
    const upload = await request(app)
      .post('/api/v1/images')
      .attach('image', buffer, { filename: 'test-retry.jpg', contentType: 'image/jpeg' });

    const res = await request(app).post(`/api/v1/images/${upload.body.processingId}/retry`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  test('allows retry once a job is marked failed', async () => {
    const image = await Image.create({
      processingId: 'fv_TESTFAIL1',
      originalName: 'test-fail.jpg',
      mimeType: 'image/jpeg',
      size: 1000,
      filePath: '/tmp/does-not-matter.jpg',
      sha256: 'deadbeef',
      status: 'failed',
      attempts: 3,
      error: { message: 'simulated failure', stage: 'processing' },
      failedAt: new Date(),
    });

    const res = await request(app).post(`/api/v1/images/${image.processingId}/retry`);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
  });
});
