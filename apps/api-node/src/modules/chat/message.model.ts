import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface ICitation {
  citationNumber?: number;
  documentId: string;
  chunkId: string;
  pageNumber: number;
  type: 'text' | 'image' | 'table';
  excerpt: string;
  score?: number;
}

export interface IMessage extends MongooseDocument {
  conversationId: mongoose.Types.ObjectId;
  clerkUserId: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ICitation[];
  createdAt: Date;
}

const CitationSchema = new Schema<ICitation>({
  citationNumber: { type: Number },
  documentId: { type: String, required: true },
  chunkId: { type: String, required: true },
  pageNumber: { type: Number, required: true },
  type: { type: String, enum: ['text', 'image', 'table'], required: true },
  excerpt: { type: String, required: true },
  score: { type: Number }
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  clerkUserId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  citations: [CitationSchema]
}, { timestamps: { createdAt: true, updatedAt: false } });

export const MessageModel = mongoose.model<IMessage>('Message', MessageSchema);
