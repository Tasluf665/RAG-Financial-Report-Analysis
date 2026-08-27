import express from 'express';
import dotenv from 'dotenv';

// Load environment variables before importing middleware that relies on them
dotenv.config();

import { authMiddleware, requireAuthentication } from './middleware/auth.middleware';
import { getMe, updateSettings } from './modules/users/users.controller';
import { updateSettingsSchema } from './modules/users/users.schema';
import { validateRequest } from './middleware/validate.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { uploadMiddleware } from './middleware/upload.middleware';
import { 
  uploadDocuments, listDocuments, getDocument, getDocumentStatus, getDocumentChunks,
  streamDocumentFile, deleteDocument, reprocessDocument,
  internalUpdateDocumentStatus, internalCompleteDocumentIngestion
} from './modules/documents/documents.controller';
import { documentIdParamSchema } from './modules/documents/documents.schema';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 1. Request ID injection
app.use(requestIdMiddleware);

// Internal Service Authentication Middleware
const requireInternalToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers['x-internal-service-token'];
  if (token !== process.env.INTERNAL_SERVICE_TOKEN) {
    res.status(403).json({ error: 'Forbidden: Invalid internal token' });
    return;
  }
  next();
};

// Internal Webhooks
app.patch('/internal/documents/:documentId/status', requireInternalToken, internalUpdateDocumentStatus);
app.post('/internal/documents/:documentId/complete', requireInternalToken, internalCompleteDocumentIngestion);

// Base Clerk middleware for all API routes (sets req.auth if token exists)
app.use('/api', authMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-node', requestId: (req as any).id });
});

// User routes
app.get('/api/me', requireAuthentication, getMe);
app.patch('/api/me/settings', requireAuthentication, validateRequest(updateSettingsSchema), updateSettings);

// Document routes
app.get('/api/documents', requireAuthentication, listDocuments);
app.post('/api/documents', requireAuthentication, uploadMiddleware.array('files'), uploadDocuments);

// Document routes requiring specific ID validation
const validateDocId = validateRequest(documentIdParamSchema);

app.get('/api/documents/:documentId', requireAuthentication, validateDocId, getDocument);
app.get('/api/documents/:documentId/status', requireAuthentication, validateDocId, getDocumentStatus);
app.get('/api/documents/:documentId/chunks', requireAuthentication, validateDocId, getDocumentChunks);
app.get('/api/documents/:documentId/file', requireAuthentication, validateDocId, streamDocumentFile);
app.delete('/api/documents/:documentId', requireAuthentication, validateDocId, deleteDocument);
app.post('/api/documents/:documentId/reprocess', requireAuthentication, validateDocId, reprocessDocument);

// 3. Global Error Handler (must be last)
app.use(errorMiddleware);

export default app;
