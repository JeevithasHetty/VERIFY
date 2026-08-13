import mongoose from 'mongoose';

const { Schema } = mongoose;

const ImageSchema = new Schema(
  {
    processingId: { type: String, required: true, unique: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    filePath: { type: String, required: true },
    storageUrl: { type: String },
    sha256: { type: String, required: true, index: true },
    perceptualHash: { type: String, index: true },
    width: { type: Number },
    height: { type: Number },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    currentStage: { type: String, default: null },

    attempts: { type: Number, default: 0 },
    idempotencyKey: { type: String, index: true, sparse: true },
    error: {
      message: { type: String },
      stage: { type: String },
    },

    batchId: { type: String, index: true, sparse: true },

    createdAt: { type: Date, default: Date.now },
    startedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
  },
  { timestamps: true }
);

// Compound index to speed up duplicate lookups (exact + near) scoped to recency.
ImageSchema.index({ sha256: 1, createdAt: -1 });

export const Image = mongoose.model('Image', ImageSchema);

export default Image;
