import { env } from '../../config/env.js';
import { LocalStorageService } from './localStorage.js';
import { MongoStorageService } from './mongoStorage.js';

/**
 * Factory that returns the configured storage backend.
 * Controllers and workers depend only on this interface:
 *   save(buffer, filename) -> { filePath, storageUrl }
 *   read(filePath) -> Buffer
 *   getUrl(filePath) -> string
 *
 * This keeps the rest of the application unaware of whether images
 * live on local disk or in MongoDB GridFS, making deployment storage a config change.
 */
let instance;

export function getStorageService() {
  if (instance) return instance;

  instance =
    env.storage.provider === 'mongodb'
      ? new MongoStorageService()
      : new LocalStorageService();

  return instance;
}

export default getStorageService;
