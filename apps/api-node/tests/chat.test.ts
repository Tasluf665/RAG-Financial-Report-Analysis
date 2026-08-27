import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import { ConversationModel } from '../src/modules/chat/conversation.model';
import { MessageModel } from '../src/modules/chat/message.model';
import { DocumentModel } from '../src/modules/documents/document.model';
import * as ragClient from '../src/services/rag-client.service';

// Mock Clerk auth
let currentAuthUserId: string | null = 'user_test_123';

jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req: any, res: any, next: any) => next(),
  getAuth: (req: any) => ({
    userId: currentAuthUserId,
    sessionId: 'sess_123'
  })
}));

describe('Chat API and Persistence', () => {
  beforeEach(() => {
    currentAuthUserId = 'user_test_123';
    jest.clearAllMocks();
  });

  describe('Conversation CRUD', () => {
    it('POST /api/conversations should create a conversation', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .send({ title: 'Q3 Financial Analysis' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.title).toBe('Q3 Financial Analysis');
      expect(res.body.data.clerkUserId).toBe('user_test_123');
      expect(res.body.data._id).toBeDefined();
    });

    it('POST /api/conversations without title should use default title', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('New Conversation');
    });

    it('GET /api/conversations should list user conversations sorted by updatedAt', async () => {
      await ConversationModel.create({
        clerkUserId: 'user_test_123',
        title: 'Old Conversation',
        createdAt: new Date(Date.now() - 10000),
        updatedAt: new Date(Date.now() - 10000)
      });
      await ConversationModel.create({
        clerkUserId: 'user_test_123',
        title: 'Recent Conversation',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      // Another user's conversation (must NOT be returned)
      await ConversationModel.create({
        clerkUserId: 'other_user_456',
        title: 'Other User Conversation'
      });

      const res = await request(app).get('/api/conversations');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].title).toBe('Recent Conversation');
      expect(res.body.data[1].title).toBe('Old Conversation');
    });

    it('GET /api/conversations/:id should return conversation and messages', async () => {
      const conv = await ConversationModel.create({
        clerkUserId: 'user_test_123',
        title: 'Detailed Chat'
      });

      await MessageModel.create({
        conversationId: conv._id,
        clerkUserId: 'user_test_123',
        role: 'user',
        content: 'What was the EBITDA?'
      });

      await MessageModel.create({
        conversationId: conv._id,
        clerkUserId: 'user_test_123',
        role: 'assistant',
        content: 'EBITDA was $15M [1].',
        citations: [
          {
            documentId: 'doc_1',
            chunkId: 'doc_1:v1:001',
            pageNumber: 2,
            type: 'text',
            excerpt: 'EBITDA was $15M',
            score: 0.95
          }
        ]
      });

      const res = await request(app).get(`/api/conversations/${conv._id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation.title).toBe('Detailed Chat');
      expect(res.body.data.messages.length).toBe(2);
      expect(res.body.data.messages[0].role).toBe('user');
      expect(res.body.data.messages[1].role).toBe('assistant');
      expect(res.body.data.messages[1].citations.length).toBe(1);
    });

    it('GET /api/conversations/:id should return 404 for another user conversation', async () => {
      const otherConv = await ConversationModel.create({
        clerkUserId: 'other_user_456',
        title: 'Secret Chat'
      });

      const res = await request(app).get(`/api/conversations/${otherConv._id}`);
      expect(res.status).toBe(404);
    });

    it('DELETE /api/conversations/:id should remove conversation and messages', async () => {
      const conv = await ConversationModel.create({
        clerkUserId: 'user_test_123',
        title: 'To Delete'
      });

      await MessageModel.create({
        conversationId: conv._id,
        clerkUserId: 'user_test_123',
        role: 'user',
        content: 'Will be deleted'
      });

      const res = await request(app).delete(`/api/conversations/${conv._id}`);
      expect(res.status).toBe(200);

      const foundConv = await ConversationModel.findById(conv._id);
      expect(foundConv).toBeNull();
      const foundMessages = await MessageModel.find({ conversationId: conv._id });
      expect(foundMessages.length).toBe(0);
    });
  });

  describe('POST /api/conversations/:conversationId/messages', () => {
    it('should reject unauthorized document ID with 403', async () => {
      const conv = await ConversationModel.create({
        clerkUserId: 'user_test_123',
        title: 'Scope Test'
      });

      // Document belonging to someone else
      const otherDoc = await DocumentModel.create({
        _id: new mongoose.Types.ObjectId(),
        clerkUserId: 'other_user_999',
        originalFilename: 'secret.pdf',
        storedFilename: 'secret.pdf',
        storagePath: '/path/to/secret.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: 'ready',
        processingVersion: 1
      });

      const res = await request(app)
        .post(`/api/conversations/${conv._id}/messages`)
        .send({
          message: 'Can you analyze this document?',
          documentIds: [otherDoc._id.toString()]
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED_DOCUMENT_SCOPE');
    });

    it('should process message with valid document scope and persist citations', async () => {
      const conv = await ConversationModel.create({
        clerkUserId: 'user_test_123',
        title: 'New Conversation'
      });

      // User-owned document
      const myDoc = await DocumentModel.create({
        _id: new mongoose.Types.ObjectId(),
        clerkUserId: 'user_test_123',
        originalFilename: 'annual_report.pdf',
        storedFilename: 'annual_report.pdf',
        storagePath: '/path/to/annual_report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        status: 'ready',
        processingVersion: 1
      });

      // Mock queryDocuments RAG response
      const mockQueryDocs = jest.spyOn(ragClient, 'queryDocuments').mockResolvedValue({
        answer: 'Operating revenue grew by 18% in FY24 [1].',
        sources: [
          {
            citationNumber: 1,
            documentId: myDoc._id.toString(),
            chunkId: `${myDoc._id}:v1:003`,
            pageNumber: 5,
            type: 'text',
            excerpt: 'Operating revenue grew by 18% in FY24',
            retrievalSummary: null,
            score: 0.94
          }
        ],
        retrieval: {
          retrievedCount: 4,
          usedCount: 1,
          model: 'google/gemini-flash-1.5'
        }
      });

      const res = await request(app)
        .post(`/api/conversations/${conv._id}/messages`)
        .send({
          message: 'What was the operating revenue growth?',
          documentIds: [myDoc._id.toString()],
          answerStyle: 'concise'
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.userMessage.content).toBe('What was the operating revenue growth?');
      expect(res.body.data.assistantMessage.content).toBe('Operating revenue grew by 18% in FY24 [1].');
      expect(res.body.data.assistantMessage.citations.length).toBe(1);
      expect(res.body.data.assistantMessage.citations[0].chunkId).toBe(`${myDoc._id}:v1:003`);

      // Verify messages exist in MongoDB
      const savedMessages = await MessageModel.find({ conversationId: conv._id });
      expect(savedMessages.length).toBe(2);

      // Verify conversation title updated from default 'New Conversation'
      const updatedConv = await ConversationModel.findById(conv._id);
      expect(updatedConv?.title).toBe('What was the operating revenue growth?');

      mockQueryDocs.mockRestore();
    });

    it('should return 401 if unauthenticated', async () => {
      currentAuthUserId = null;
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/conversations/${fakeId}/messages`)
        .send({ message: 'Hello?' });

      expect(res.status).toBe(401);
    });
  });
});
