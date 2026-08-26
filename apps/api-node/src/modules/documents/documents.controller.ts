import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { DocumentModel } from './document.model';
import { ChunkModel } from '../chunks/chunk.model';
import { storageService } from '../../services/storage.service';
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
        status: 'queued'
      });

      uploadedDocuments.push(doc);
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
    
    const docs = await DocumentModel.find({ clerkUserId })
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
    await doc.save();

    res.json({ status: 'success', data: doc });
  } catch (error) {
    console.error('Error reprocessing document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
