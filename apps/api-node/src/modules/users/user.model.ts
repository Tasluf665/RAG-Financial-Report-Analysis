import mongoose, { Schema, Document } from 'mongoose';

export interface IUserSettings {
  theme: 'light' | 'dark' | 'system';
  defaultChatScope: 'all' | 'selected';
  answerStyle: 'concise' | 'balanced' | 'detailed';
  showCitations: boolean;
  showRetrievalScores: boolean;
  chunkSize: number;
  chunkOverlap: number;
  summarizeImages: boolean;
  summarizeTables: boolean;
  embeddingModel: string;
}

export interface IUser extends Document {
  clerkUserId: string;
  email: string;
  displayName?: string;
  settings: IUserSettings;
  createdAt: Date;
  updatedAt: Date;
}

const UserSettingsSchema = new Schema<IUserSettings>({
  theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
  defaultChatScope: { type: String, enum: ['all', 'selected'], default: 'all' },
  answerStyle: { type: String, enum: ['concise', 'balanced', 'detailed'], default: 'balanced' },
  showCitations: { type: Boolean, default: true },
  showRetrievalScores: { type: Boolean, default: false },
  chunkSize: { type: Number, default: 1000 },
  chunkOverlap: { type: Number, default: 200 },
  summarizeImages: { type: Boolean, default: false },
  summarizeTables: { type: Boolean, default: true },
  embeddingModel: { type: String, default: 'default' }
}, { _id: false });

const UserSchema = new Schema<IUser>({
  clerkUserId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  displayName: { type: String },
  settings: { type: UserSettingsSchema, default: () => ({}) }
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
