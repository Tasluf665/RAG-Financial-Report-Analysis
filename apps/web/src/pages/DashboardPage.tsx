import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { FileText, Layers, HardDrive, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { DocumentDropzone } from '../components/Upload/DocumentDropzone';
import './Dashboard.css';

interface Document {
  _id: string;
  originalFilename: string;
  status: 'queued' | 'processing' | 'processing:parsing' | 'processing:chunking' | 'processing:embedding' | 'ready' | 'failed';
  sizeBytes: number;
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
  stats?: {
    chunkCount: number;
  };
}

export function DashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const payload = await response.json();
        setDocuments(payload.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchDocuments();
    
    // Poll for status updates if any document is processing
    const hasProcessing = documents.some(d => d.status.startsWith('processing') || d.status === 'queued');
    let intervalId: NodeJS.Timeout;
    
    if (hasProcessing) {
      intervalId = setInterval(fetchDocuments, 3000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchDocuments, documents]);

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'ready': return <CheckCircle2 size={16} className="text-success" />;
      case 'failed': return <AlertCircle size={16} className="text-error" />;
      case 'queued':
      case 'processing':
      case 'processing:parsing':
      case 'processing:chunking':
      case 'processing:embedding': return <RefreshCw size={16} className="text-primary animate-spin" />;
      default: return <Clock size={16} className="text-muted" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch(status) {
      case 'ready': return 'badge-success';
      case 'failed': return 'badge-error';
      case 'queued':
      case 'processing':
      case 'processing:parsing':
      case 'processing:chunking':
      case 'processing:embedding': return 'badge-primary';
      default: return 'badge-default';
    }
  };

  const formatStatusText = (status: string) => {
    if (status.startsWith('processing:')) {
      const stage = status.split(':')[1];
      return stage.charAt(0).toUpperCase() + stage.slice(1) + '...';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const totalPages = documents.reduce((sum, doc) => sum + (doc.pageCount || 0), 0);
  const totalChunks = documents.reduce((sum, doc) => sum + (doc.stats?.chunkCount || 0), 0);

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">DocuRAG Workspace</h1>
          <p className="dashboard-subtitle">Manage and chat with your indexed documents</p>
        </div>
      </header>

      <DocumentDropzone onUploadComplete={fetchDocuments} />

      <div className="metrics-grid">
        <div className="metric-card card">
          <div className="metric-icon bg-primary-light">
            <FileText className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <h3 className="metric-value">{documents.length}</h3>
            <p className="metric-label">Total Documents</p>
          </div>
        </div>
        <div className="metric-card card">
          <div className="metric-icon bg-primary-light">
            <Layers className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <h3 className="metric-value">{totalPages}</h3>
            <p className="metric-label">Pages Processed</p>
          </div>
        </div>
        <div className="metric-card card">
          <div className="metric-icon bg-primary-light">
            <HardDrive className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <h3 className="metric-value">{totalChunks}</h3>
            <p className="metric-label">Vector Chunks</p>
          </div>
        </div>
      </div>

      <div className="document-list card">
        <div className="list-header">
          <h2 className="list-title">Recent Documents</h2>
        </div>
        
        {loading ? (
          <div className="list-empty">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="list-empty">No documents uploaded yet. Upload a PDF above to get started.</div>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc._id} onClick={() => doc.status === 'ready' && navigate(`/documents/${doc._id}`)} className={doc.status === 'ready' ? 'clickable-row' : ''}>
                  <td className="doc-name">
                    <FileText size={16} className="text-muted" />
                    <span>{doc.originalFilename}</span>
                  </td>
                  <td>
                    <div className={`status-badge ${getStatusBadgeClass(doc.status)}`}>
                      {getStatusIcon(doc.status)}
                      <span className="capitalize">{formatStatusText(doc.status)}</span>
                    </div>
                  </td>
                  <td>{doc.pageCount || '-'}</td>
                  <td className="text-muted text-sm">{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</td>
                  <td>
                    <button 
                      className="btn-primary-sm"
                      disabled={doc.status !== 'ready'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (doc.status === 'ready') navigate(`/documents/${doc._id}`);
                      }}
                    >
                      Explore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
