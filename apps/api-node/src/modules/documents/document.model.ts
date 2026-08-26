import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IDocument extends MongooseDocument {
  clerkUserId: string;
  originalFilename: string;
  storedFilename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  status: 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed' | 'reprocessing';
  processingVersion: number;
  processingConfig: {
    chunkSize: number;
    chunkOverlap: number;
    summarizeImages: boolean;
    summarizeTables: boolean;
    embeddingModel: string;
  };
  stats: {
    chunkCount: number;
    imageCount: number;
    tableCount: number;
  };
  failure?: {
    code: string;
    message: string;
    occurredAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>({
  clerkUserId: { type: String, required: true, index: true },
  originalFilename: { type: String, required: true },
  storedFilename: { type: String, required: true },
  storagePath: { type: String, required: true },
  mimeType: { type: String, required: true, default: 'application/pdf' },
  sizeBytes: { type: Number, required: true },
  pageCount: { type: Number },
  status: { 
    type: String, 
    required: true,
    enum: ['uploaded', 'queued', 'processing', 'ready', 'failed', 'reprocessing'],
    default: 'queued'
  },
  processingVersion: { type: Number, default: 1 },
  processingConfig: {
    chunkSize: { type: Number, default: 1000 },
    chunkOverlap: { type: Number, default: 200 },
    summarizeImages: { type: Boolean, default: false },
    summarizeTables: { type: Boolean, default: true },
    embeddingModel: { type: String, required: true, default: 'default' }
  },
  stats: {
    chunkCount: { type: Number, default: 0 },
    imageCount: { type: Number, default: 0 },
    tableCount: { type: Number, default: 0 }
  },
  failure: {
    code: { type: String },
    message: { type: String },
    occurredAt: { type: Date }
  }
}, { timestamps: true });

// Compound index for querying user's documents by status and creation date
DocumentSchema.index({ clerkUserId: 1, status: 1, createdAt: -1 });

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
