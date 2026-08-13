import { Router } from 'express';
import { uploadSingle, uploadBatch } from '../middleware/upload.js';
import {
  uploadImage,
  uploadBatch as uploadBatchController,
  getStatus,
  getResults,
  getError,
  getFile,
  getTimeline,
  getMetrics,
  retryImage,
} from '../controllers/imageController.js';

const router = Router();

/**
 * @openapi
 * /images:
 *   post:
 *     summary: Upload a single vehicle evidence image for asynchronous verification
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *         required: false
 *     responses:
 *       202:
 *         description: Accepted for async processing
 *       400:
 *         description: Invalid file
 */
router.post('/images', uploadSingle, uploadImage);

/**
 * @openapi
 * /images/batch:
 *   post:
 *     summary: Upload up to 10 images in a single batch
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       202:
 *         description: Accepted for async processing
 */
router.post('/images/batch', uploadBatch, uploadBatchController);

/**
 * @openapi
 * /images/{processingId}/status:
 *   get:
 *     summary: Get the current processing status of an image
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: processingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Status returned }
 *       404: { description: Unknown processing ID }
 */
router.get('/images/:processingId/status', getStatus);

router.get('/images/:processingId/file', getFile);

/**
 * @openapi
 * /images/{processingId}/results:
 *   get:
 *     summary: Get full structured analysis results for a completed image
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: processingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Results returned }
 *       404: { description: Unknown processing ID }
 */
router.get('/images/:processingId/results', getResults);

/**
 * @openapi
 * /images/{processingId}/error:
 *   get:
 *     summary: Get failure details for an image
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: processingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Error details returned }
 *       404: { description: Unknown processing ID }
 */
router.get('/images/:processingId/error', getError);

/**
 * @openapi
 * /images/{processingId}/timeline:
 *   get:
 *     summary: Get the processing timeline for an image
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: processingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Timeline returned }
 */
router.get('/images/:processingId/timeline', getTimeline);

/**
 * @openapi
 * /images/{processingId}/metrics:
 *   get:
 *     summary: Get processing performance metrics for an image
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: processingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Metrics returned }
 */
router.get('/images/:processingId/metrics', getMetrics);

/**
 * @openapi
 * /images/{processingId}/retry:
 *   post:
 *     summary: Retry a failed image processing job
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: processingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202: { description: Requeued }
 *       400: { description: Job is not in a failed state }
 *       404: { description: Unknown processing ID }
 */
router.post('/images/:processingId/retry', retryImage);

export default router;
