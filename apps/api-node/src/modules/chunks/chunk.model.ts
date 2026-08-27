import mongoose, { Schema, Document } from 'mongoose';

export interface IChunk extends Document<string> {
  _id: string;
  documentId: mongoose.Types.ObjectId;
  clerkUserId: string;
  ordinal: number;
  type: 'text' | 'image' | 'table';
  pageNumber: number;
  content: string;
  retrievalSummary?: string;
  assetPath?: string;
  sourceLocation?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  tokenCount?: number;
  charCount: number;
  embedding: {
    provider: string;
    model: string;
    status: 'created' | 'failed';
  };
  processingVersion: number;
  createdAt: Date;
}

const ChunkSchema = new Schema<IChunk>({
  _id: { type: String, required: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  clerkUserId: { type: String, required: true },
  ordinal: { type: Number, required: true },
  type: { type: String, enum: ['text', 'image', 'table'], required: true },
  pageNumber: { type: Number, required: true },
  content: { type: String, required: true },
  retrievalSummary: { type: String },
  assetPath: { type: String },
  sourceLocation: {
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    height: { type: Number }
  },
  tokenCount: { type: Number },
  charCount: { type: Number, required: true },
  embedding: {
    provider: { type: String, required: true, default: 'openrouter' },
    model: { type: String, required: true },
    status: { type: String, enum: ['created', 'failed'], default: 'created' }
  },
  processingVersion: { type: Number, required: true, default: 1 }
}, { timestamps: { createdAt: true, updatedAt: false } });

// Essential indexes for retrieval and ownership checks
ChunkSchema.index({ documentId: 1, ordinal: 1, type: 1, pageNumber: 1 });
ChunkSchema.index({ clerkUserId: 1 });

export const ChunkModel = mongoose.model<IChunk>('Chunk', ChunkSchema);
