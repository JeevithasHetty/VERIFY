import multer from 'multer';
import { env } from '../config/env.js';

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  if (!env.upload.allowedMimeTypes.includes(file.mimetype)) {
    const err = new Error(
      `Unsupported file type: ${file.mimetype}. Allowed: ${env.upload.allowedMimeTypes.join(', ')}`
    );
    err.status = 400;
    err.code = 'INVALID_MIME_TYPE';
    return cb(err);
  }
  return cb(null, true);
}

const limits = {
  fileSize: env.upload.maxSizeMb * 1024 * 1024,
};

export const uploadSingle = multer({ storage, fileFilter, limits }).single('image');

export const uploadBatch = multer({ storage, fileFilter, limits }).array(
  'images',
  env.upload.maxBatchSize
);

export default { uploadSingle, uploadBatch };
