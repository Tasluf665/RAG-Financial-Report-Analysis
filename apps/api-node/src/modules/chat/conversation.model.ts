import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IConversation extends MongooseDocument {
  clerkUserId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
  clerkUserId: { type: String, required: true, index: true },
  title: { type: String, required: true }
}, { timestamps: true });

export const ConversationModel = mongoose.model<IConversation>('Conversation', ConversationSchema);
