import { z } from 'zod';

export const updateSettingsSchema = z.object({
  body: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    defaultChatScope: z.enum(['all', 'selected']).optional(),
    answerStyle: z.enum(['concise', 'balanced', 'detailed']).optional(),
    showCitations: z.boolean().optional(),
    showRetrievalScores: z.boolean().optional(),
    chunkSize: z.number().int().min(100).max(4000).optional(),
    chunkOverlap: z.number().int().min(0).max(1000).optional(),
    summarizeImages: z.boolean().optional(),
    summarizeTables: z.boolean().optional(),
    embeddingModel: z.string().optional()
  })
});
