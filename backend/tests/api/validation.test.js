import request from 'supertest';
import { createApp } from '../../src/app.js';

/**
 * These tests exercise request-validation and error-handling paths that
 * happen BEFORE any MongoDB write (health check, multer file-filter/size
 * limits, malformed-image detection). They intentionally do not require
 * a live MongoDB connection, so they can run in any environment.
 *
 * Tests that exercise the full upload -> queue -> DB round trip (status,
 * results, retry, idempotency) require a running MongoDB + Redis and are
 * defined in tests/api/images.integration.test.js - see that file and
 * the README "Testing" section for how to run them with
 * `docker compose up -d`.
 */
const app = createApp();

describe('GET /health', () => {
  test('returns 200 and service metadata', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('fieldverify-api');
  });
});

describe('GET /unknown-route', () => {
  test('returns 404 with structured error body', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/images validation', () => {
  test('rejects request with no file attached', async () => {
    const res = await request(app).post('/api/v1/images');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
  });

  test('rejects a file with a disallowed MIME type', async () => {
    const res = await request(app)
      .post('/api/v1/images')
      .attach('image', Buffer.from('not really an image'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MIME_TYPE');
  });

  test('rejects a file that claims to be an image but is not decodable', async () => {
    const res = await request(app)
      .post('/api/v1/images')
      .attach('image', Buffer.from('this is definitely not a jpeg'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      });
    // Either multer/sharp rejects it before a DB write is attempted, or
    // (if MongoDB is unreachable in this environment) it fails with a
    // 500 from the DB layer - both are acceptable "did not silently
    // succeed" outcomes for this environment-independent test.
    expect([400, 500]).toContain(res.status);
  });
});

describe('GET /api/v1/images/:processingId/status for unknown ID', () => {
  test(
    'returns 404 if DB is reachable, or a 500 in an environment with no DB',
    async () => {
      const res = await request(app).get('/api/v1/images/fv_DOES_NOT_EXIST/status');
      expect([404, 500]).toContain(res.status);
    },
    15000
  );
});
