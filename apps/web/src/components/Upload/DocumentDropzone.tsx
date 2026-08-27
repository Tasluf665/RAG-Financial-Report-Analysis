import React, { useCallback, useState } from 'react';
import { UploadCloud, File as FileIcon, X } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import './DocumentDropzone.css';

interface DocumentDropzoneProps {
  onUploadComplete: () => void;
}

export function DocumentDropzone({ onUploadComplete }: DocumentDropzoneProps) {
  const { getToken } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = async (files: File[]) => {
    const pdfFiles = files.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      setError('Please upload PDF files only.');
      return;
    }

    setIsUploading(true);
    setError(null);
    
    const formData = new FormData();
    pdfFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const token = await getToken();
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Upload failed (${response.status}): ${errText}`);
      }
      
      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="dropzone-wrapper">
      {error && <div className="dropzone-error">{error}</div>}
      
      <div 
        className={`dropzone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          multiple 
          accept="application/pdf" 
          onChange={handleFileInput} 
          className="file-input" 
          id="file-upload"
          disabled={isUploading}
        />
        <div className="dropzone-content">
          <div className="dropzone-icon-wrapper">
            <UploadCloud size={24} className="dropzone-icon" />
          </div>
          <h3 className="dropzone-title">Drop PDFs here or browse files</h3>
          <p className="dropzone-subtitle">PDF files only · Maximum 50 MB per file · Upload multiple files</p>
          
          <label htmlFor="file-upload" className="dropzone-btn">
            Browse files
          </label>

          <div className="dropzone-badge">
            <span className="badge-icon">✨</span>
            <span>Files are automatically processed for RAG upon upload</span>
          </div>

          {isUploading && (
            <div className="upload-overlay">
              <div className="upload-spinner"></div>
              <p>Uploading and queuing document...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
