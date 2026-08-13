import mongoose from 'mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  return new GridFSBucket(db, { bucketName: 'fieldverifyImages' });
}

export class MongoStorageService {
  async save(buffer, filename) {
    const upload = bucket().openUploadStream(filename, { contentType: 'image/*' });
    await new Promise((resolve, reject) => {
      upload.on('finish', resolve);
      upload.on('error', reject);
      upload.end(buffer);
    });
    const id = upload.id.toString();
    const processingId = filename.replace(/\.[^.]+$/, '');
    return {
      filePath: `gridfs:${id}`,
      storageUrl: `/api/v1/images/${processingId}/file`,
    };
  }

  async read(filePath) {
    const id = String(filePath || '').replace(/^gridfs:/, '');
    if (!ObjectId.isValid(id)) throw new Error('Invalid GridFS file ID');
    const stream = bucket().openDownloadStream(new ObjectId(id));
    const chunks = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async stream(filePath, res) {
    const id = String(filePath || '').replace(/^gridfs:/, '');
    if (!ObjectId.isValid(id)) throw new Error('Invalid GridFS file ID');
    const files = await bucket().find({ _id: new ObjectId(id) }).toArray();
    if (!files[0]) return false;
    res.setHeader('Content-Type', files[0].contentType || 'application/octet-stream');
    res.setHeader('Content-Length', files[0].length);
    bucket().openDownloadStream(new ObjectId(id)).pipe(res);
    return true;
  }

  getUrl(storageUrl) {
    return storageUrl;
  }
}

export default MongoStorageService;
