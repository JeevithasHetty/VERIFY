import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return mongoose.connection;

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info({ event: 'mongodb_connected' }, 'MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ event: 'mongodb_error', error: err.message }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn({ event: 'mongodb_disconnected' }, 'MongoDB disconnected');
  });

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 8000,
  });

  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  isConnected = false;
}

export default connectDB;
