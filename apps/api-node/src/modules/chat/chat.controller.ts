import { Request, Response } from 'express';
import { ConversationModel } from './conversation.model';
import { MessageModel } from './message.model';
import { DocumentModel } from '../documents/document.model';
import { User } from '../users/user.model';
import { queryDocuments, RagClientError } from '../../services/rag-client.service';

// GET /api/conversations
export const listConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversations = await ConversationModel.find({ clerkUserId }).sort({ updatedAt: -1 });

    res.json({
      status: 'success',
      data: conversations,
      items: conversations,
      total: conversations.length
    });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/conversations
export const createConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const title = req.body.title?.trim() || 'New Conversation';

    const conversation = await ConversationModel.create({
      clerkUserId,
      title
    });

    res.status(201).json({
      status: 'success',
      data: conversation
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/conversations/:conversationId
export const getConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { conversationId } = req.params;

    const conversation = await ConversationModel.findOne({ _id: conversationId, clerkUserId });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await MessageModel.find({ conversationId, clerkUserId }).sort({ createdAt: 1 });

    res.json({
      status: 'success',
      data: {
        conversation,
        messages
      }
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/conversations/:conversationId
export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { conversationId } = req.params;

    const conversation = await ConversationModel.findOne({ _id: conversationId, clerkUserId });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await MessageModel.deleteMany({ conversationId, clerkUserId });
    await ConversationModel.deleteOne({ _id: conversationId, clerkUserId });

    res.json({
      status: 'success',
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/conversations/:conversationId/messages
export const createMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { conversationId } = req.params;
    const { message, documentIds, answerStyle } = req.body;

    // 1. Verify conversation ownership
    const conversation = await ConversationModel.findOne({ _id: conversationId, clerkUserId });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // 2. Validate document scope authorization
    let validatedDocIds: string[] = [];
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      const ownedDocs = await DocumentModel.find({
        _id: { $in: documentIds },
        clerkUserId
      });

      // If any requested document is not owned by the user
      if (ownedDocs.length !== documentIds.length) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_DOCUMENT_SCOPE',
            message: 'One or more selected documents are invalid or not accessible'
          }
        });
        return;
      }

      validatedDocIds = ownedDocs.map(doc => doc._id.toString());
    }

    // 3. Persist User Message
    const userMessage = await MessageModel.create({
      conversationId: conversation._id,
      clerkUserId,
      role: 'user',
      content: message
    });

    // 4. Retrieve user answer style preference if not explicitly supplied
    let style = answerStyle;
    if (!style) {
      const user = await User.findOne({ clerkUserId });
      style = user?.settings?.answerStyle || 'balanced';
    }

    // 5. Query Python RAG service
    const requestId = (req as any).id || `req_${Date.now()}`;
    let ragResponse;
    try {
      ragResponse = await queryDocuments({
        requestId,
        clerkUserId,
        documentIds: validatedDocIds,
        question: message,
        answerStyle: style,
        topK: 8
      }, requestId);
    } catch (ragErr) {
      console.error('RAG service query error:', ragErr);
      const statusCode = ragErr instanceof RagClientError ? ragErr.statusCode : 503;
      const code = ragErr instanceof RagClientError ? ragErr.code : 'RAG_SERVICE_UNAVAILABLE';
      res.status(statusCode).json({
        error: {
          code,
          message: 'Failed to generate answer from document service. Please try again later.'
        }
      });
      return;
    }

    // 6. Persist Assistant Message with structured citations
    const assistantMessage = await MessageModel.create({
      conversationId: conversation._id,
      clerkUserId,
      role: 'assistant',
      content: ragResponse.answer,
      citations: ragResponse.sources
    });

    // 7. Auto-update conversation title if it was the default and update timestamp
    const updatePayload: any = { updatedAt: new Date() };
    if (conversation.title === 'New Conversation') {
      const trimmedTitle = message.length > 40 ? `${message.slice(0, 40)}…` : message;
      updatePayload.title = trimmedTitle;
    }
    await ConversationModel.updateOne({ _id: conversation._id }, updatePayload);

    res.status(201).json({
      status: 'success',
      data: {
        userMessage,
        assistantMessage,
        retrieval: ragResponse.retrieval
      }
    });
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
