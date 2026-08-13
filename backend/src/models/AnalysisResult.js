import mongoose from 'mongoose';

const { Schema } = mongoose;

const IssueSchema = new Schema(
  {
    type: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
    confidence: { type: Number, required: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
    message: { type: String, required: true },
    recommendedAction: { type: String },
    measurement: { type: Schema.Types.Mixed },
    threshold: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const TimelineEventSchema = new Schema(
  {
    stage: { type: String, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false }
);

const AnalysisResultSchema = new Schema(
  {
    processingId: { type: String, required: true, unique: true, index: true },

    quality: { type: Schema.Types.Mixed, default: {} },
    ocr: { type: Schema.Types.Mixed, default: {} },
    duplicate: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    screenshot: { type: Schema.Types.Mixed, default: {} },
    photoOfPhoto: { type: Schema.Types.Mixed, default: {} },
    tampering: { type: Schema.Types.Mixed, default: {} },
    vehicle: { type: Schema.Types.Mixed, default: {} },
    aiReview: { type: Schema.Types.Mixed, default: null },

    scores: {
      imageQuality: { type: Number },
      ocr: { type: Number },
      uniqueness: { type: Number },
      authenticity: { type: Number },
      vehicleEvidence: { type: Number },
      overall: { type: Number },
    },

    issues: { type: [IssueSchema], default: [] },
    recommendation: { type: String, enum: ['ACCEPT', 'REVIEW', 'REJECT'], default: null },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: null },
    explanation: { type: String, default: '' },

    timeline: { type: [TimelineEventSchema], default: [] },
    metrics: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const AnalysisResult = mongoose.model('AnalysisResult', AnalysisResultSchema);

export default AnalysisResult;
