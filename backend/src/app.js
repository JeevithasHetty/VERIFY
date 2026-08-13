import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import imageRoutes from './routes/imageRoutes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Serve locally stored images in development so the frontend can preview them.
  if (env.storage.provider === 'local') {
    app.use('/uploads', express.static(path.resolve(process.cwd(), env.storage.localDir)));
  }

  app.use(env.apiBasePath, apiRateLimiter);

  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'FieldVerify API',
        version: '1.0.0',
        description:
          'Intelligent Vehicle Evidence Verification API. Accepts field images, processes ' +
          'them asynchronously, and returns explainable evidence-integrity results.',
      },
      servers: [{ url: env.apiBasePath }],
    },
    apis: ['./src/routes/*.js'],
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Health check
   *     responses:
   *       200: { description: Service is up }
   */
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'fieldverify-api', timestamp: new Date().toISOString() });
  });

  app.use(env.apiBasePath, imageRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
