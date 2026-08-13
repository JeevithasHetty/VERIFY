import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';

export class LocalStorageService {
  constructor() {
    this.baseDir = path.resolve(process.cwd(), env.storage.localDir);
  }

  async _ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async save(buffer, filename) {
    await this._ensureDir();
    const filePath = path.join(this.baseDir, filename);
    await fs.writeFile(filePath, buffer);
    return {
      filePath,
      // Relative URL served by the API's static /uploads route in dev.
      storageUrl: `/uploads/${filename}`,
    };
  }

  async read(filePath) {
    return fs.readFile(filePath);
  }

  getUrl(storageUrl) {
    return storageUrl;
  }
}

export default LocalStorageService;
