import { DocumentModel } from '../modules/documents/document.model';
import { ChunkModel } from '../modules/chunks/chunk.model';
import { User } from '../modules/users/user.model';

export const triggerIngestion = async (documentId: string, clerkUserId: string, filePath: string) => {
  try {
    const user = await User.findOne({ clerkUserId });
    const config = user?.settings || {
      chunkSize: 800,
      chunkOverlap: 120,
      summarizeImages: true,
      summarizeTables: true,
      embeddingModel: 'default'
    };

    // Update document status to processing
    await DocumentModel.updateOne({ _id: documentId }, { status: 'processing' });

    const doc = await DocumentModel.findById(documentId);
    if (!doc) return;
    
    // Call Python RAG Service
    const pythonHost = process.env.RAG_HOST || '127.0.0.1';
    const pythonPort = process.env.RAG_PORT || '8000';
    const pythonToken = process.env.INTERNAL_SERVICE_TOKEN || 'default_secret';

    const response = await fetch(`http://${pythonHost}:${pythonPort}/internal/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Token': pythonToken
      },
      body: JSON.stringify({
        documentId: documentId.toString(),
        clerkUserId,
        filePath,
        processingVersion: doc.processingVersion || 1,
        config
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python service failed to queue ingestion: ${errorText}`);
    }

    // The Python API will now process this in the background and 
    // update status/complete via webhooks.

  } catch (error) {
    console.error(`Ingestion trigger failed for document ${documentId}:`, error);
    await DocumentModel.updateOne(
      { _id: documentId }, 
      { 
        status: 'failed',
        failure: { 
          message: error instanceof Error ? error.message : 'Unknown error', 
          code: 'PROCESSING_ERROR',
          occurredAt: new Date()
        }
      }
    );
  }
};
