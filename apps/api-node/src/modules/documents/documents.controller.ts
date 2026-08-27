import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { DocumentModel } from './document.model';
import { ChunkModel } from '../chunks/chunk.model';
import { storageService } from '../../services/storage.service';
import { triggerIngestion } from '../../services/ingestion.service';
import fs from 'fs';

// POST /api/documents (multipart upload)
export const uploadDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const uploadedDocuments = [];

    for (const file of files) {
      const documentId = new mongoose.Types.ObjectId();
      const storagePath = await storageService.saveFile(clerkUserId, file, documentId.toString());

      const doc = await DocumentModel.create({
        _id: documentId,
        clerkUserId,
        originalFilename: file.originalname,
        storedFilename: `${documentId.toString()}.pdf`,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: 'queued',
        processingVersion: 1
      });

      uploadedDocuments.push(doc);

      // Dispatch async ingestion task (don't await)
      triggerIngestion(documentId.toString(), clerkUserId, storagePath).catch(console.error);
    }

    res.status(201).json({ status: 'success', data: uploadedDocuments });
  } catch (error) {
    console.error('Error uploading documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/documents
export const listDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const skip = parseInt((req.query.skip as string) || '0', 10);
    const search = req.query.search as string;

    const query: any = { clerkUserId };

    if (search && search.trim().length > 0) {
      query.originalFilename = { $regex: search.trim(), $options: 'i' };
    }

    const docs = await DocumentModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ status: 'success', data: docs });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/documents/:documentId
export const getDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const { documentId } = req.params;

    const doc = await DocumentModel.findOne({ _id: documentId, clerkUserId });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    res.json({ status: 'success', data: doc });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/documents/:documentId/status
export const getDocumentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const { documentId } = req.params;

    const doc = await DocumentModel.findOne({ _id: documentId, clerkUserId }).select('status failure createdAt updatedAt');
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    res.json({ status: 'success', data: doc });
  } catch (error) {
    console.error('Error getting document status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/documents/:documentId/chunks
export const getDocumentChunks = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const { documentId } = req.params;

    const doc = await DocumentModel.findOne({ _id: documentId, clerkUserId });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const chunks = await ChunkModel.find({ documentId: doc._id }).sort({ ordinal: 1 });
    
    const formattedChunks = chunks.map(chunk => ({
      _id: chunk._id,
      chunkIndex: chunk.ordinal,
      type: chunk.type === 'image' ? 'Image' : chunk.type === 'table' ? 'Table' : 'Text',
      pageNumber: chunk.pageNumber,
      text: chunk.content,
      aiSummary: chunk.retrievalSummary,
      imageBase64: chunk.imageBase64,
      tableHtml: chunk.tableHtml,
      embeddingStatus: chunk.embedding?.status
    }));

    res.json({ status: 'success', chunks: formattedChunks });
  } catch (error) {
    console.error('Error getting document chunks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/documents/:documentId/file
export const streamDocumentFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const { documentId } = req.params;

    const doc = await DocumentModel.findOne({ _id: documentId, clerkUserId });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const filePath = storageService.getFilePath(clerkUserId, documentId);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error streaming document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/documents/:documentId
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const { documentId } = req.params;

    const doc = await DocumentModel.findOne({ _id: documentId, clerkUserId });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    await ChunkModel.deleteMany({ documentId: doc._id });
    await storageService.deleteFile(clerkUserId, documentId);
    await DocumentModel.deleteOne({ _id: documentId, clerkUserId });

    res.json({ status: 'success', message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/documents/:documentId/reprocess
export const reprocessDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    const { documentId } = req.params;

    const doc = await DocumentModel.findOne({ _id: documentId, clerkUserId });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    doc.status = 'queued';
    doc.failure = undefined;
    doc.processingVersion = (doc.processingVersion || 1) + 1;
    await doc.save();

    // Trigger async processing here (don't await)
    triggerIngestion(documentId, clerkUserId, doc.storagePath).catch(console.error);

    res.json({ status: 'success', data: doc });
  } catch (error) {
    console.error('Error reprocessing document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /internal/documents/:documentId/status
export const internalUpdateDocumentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const { status, failure } = req.body;

    const update: any = { status };
    if (failure) {
      update.failure = failure;
    }

    await DocumentModel.updateOne({ _id: documentId }, update);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error updating document status internally:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /internal/documents/:documentId/complete
export const internalCompleteDocumentIngestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const { chunks, clerkUserId } = req.body;

    const doc = await DocumentModel.findById(documentId);
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const chunksToInsert = chunks.map((chunk: any, index: number) => ({
      _id: chunk.chunkId,
      documentId: documentId,
      clerkUserId: clerkUserId,
      ordinal: index,
      type: chunk.type,
      pageNumber: chunk.pageNumber,
      content: chunk.content,
      retrievalSummary: chunk.retrievalSummary,
      imageBase64: chunk.imageBase64,
      tableHtml: chunk.tableHtml,
      charCount: chunk.content ? chunk.content.length : 0,
      embedding: {
        provider: 'openrouter',
        model: doc.processingConfig?.embeddingModel || 'text-embedding-3-small',
        status: 'created'
      },
      processingVersion: doc.processingVersion || 1
    }));

    if (chunksToInsert.length > 0) {
      await ChunkModel.insertMany(chunksToInsert);
    }

    const maxPage = chunksToInsert.reduce((max: number, chunk: any) => Math.max(max, chunk.pageNumber || 0), 0);
    const imageCount = chunksToInsert.filter((chunk: any) => chunk.type === 'image').length;
    const tableCount = chunksToInsert.filter((chunk: any) => chunk.type === 'table').length;

    await DocumentModel.updateOne(
      { _id: documentId },
      {
        status: 'ready',
        $unset: { failure: 1 },
        'stats.chunkCount': chunksToInsert.length,
        'stats.imageCount': imageCount,
        'stats.tableCount': tableCount,
        pageCount: maxPage
      }
    );

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error completing document ingestion internally:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
