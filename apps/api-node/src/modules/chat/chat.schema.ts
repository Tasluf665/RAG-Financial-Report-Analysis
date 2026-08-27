import { z } from 'zod';

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200, 'Title too long').optional()
  })
});

export const conversationIdParamSchema = z.object({
  params: z.object({
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID format')
  })
});

export const createMessageSchema = z.object({
  params: z.object({
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID format')
  }),
  body: z.object({
    message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
    documentIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid document ID format')).optional(),
    answerStyle: z.enum(['concise', 'balanced', 'detailed']).optional()
  })
});
