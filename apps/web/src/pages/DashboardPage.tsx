import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { FileText, Layers, HardDrive, RefreshCw, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DocumentDropzone } from '../components/Upload/DocumentDropzone';
import './Dashboard.css';

const PAGE_SIZE = 5;

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
    imageCount: number;
    tableCount: number;
  };
}

export function DashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalDocuments / PAGE_SIZE));

  // Debounce search; reset to page 1 whenever query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const next = searchQuery.length >= 3 ? searchQuery : '';
      setDebouncedSearch(next);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchDocuments = useCallback(async () => {
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const url = `/api/documents?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const payload = await response.json();
        setDocuments(payload.items ?? payload.data ?? []);
        if (typeof payload.total === 'number') {
          setTotalDocuments(payload.total);
        }
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }, [getToken, debouncedSearch, currentPage]);

  useEffect(() => {
    setLoading(true);
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status.startsWith('processing') || d.status === 'queued');
    if (hasProcessing) {
      const intervalId = setInterval(fetchDocuments, 3000);
      return () => clearInterval(intervalId);
    }
  }, [documents, fetchDocuments]);

  const getStatusIcon = (status: string) => {
    switch (status) {
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
    switch (status) {
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

  const totalDocPageCount = documents.reduce((sum, doc) => sum + (doc.pageCount || 0), 0);
  const totalChunks = documents.reduce((sum, doc) => sum + (doc.stats?.chunkCount || 0), 0);
  const totalImages = documents.reduce((sum, doc) => sum + (doc.stats?.imageCount || 0), 0);
  const totalTables = documents.reduce((sum, doc) => sum + (doc.stats?.tableCount || 0), 0);

  const handlePrevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const handleNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1));
  const startItem = totalDocuments === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalDocuments);

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Your document workspace</h2>
          <p className="page-subtitle">Upload, process, and explore documents for AI-powered conversations.</p>
        </div>
        <button className="btn-upload-header" onClick={() => window.scrollTo(0, 0)}>
          <FileText size={16} />
          <span>Upload PDFs</span>
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">
            <FileText className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Total Documents</p>
            <h3 className="metric-value">{totalDocuments}</h3>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">
            <Layers className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Knowledge Chunks</p>
            <h3 className="metric-value">{totalChunks}</h3>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">
            <HardDrive className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Images Summarized</p>
            <h3 className="metric-value">{totalImages}</h3>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">
            <Layers className="text-primary" size={20} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Tables Extracted</p>
            <h3 className="metric-value">{totalTables}</h3>
          </div>
        </div>
      </div>

      <DocumentDropzone onUploadComplete={() => { setCurrentPage(1); fetchDocuments(); }} />

      <div className="document-list">
        <div className="list-header">
          <h2 className="list-title">Recent documents</h2>
          <div className="list-toolbar-actions">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="btn-icon"><Layers size={16} /></button>
            <button className="btn-icon"><HardDrive size={16} /></button>
          </div>
        </div>

        {loading ? (
          <div className="list-empty">Loading documents...</div>
        ) : totalDocuments === 0 ? (
          <div className="list-empty">No documents uploaded yet. Upload a PDF above to get started.</div>
        ) : (
          <>
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Pages</th>
                  <th>Chunks</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc._id} onClick={() => doc.status === 'ready' && navigate(`/documents/${doc._id}`)} className={doc.status === 'ready' ? 'clickable-row' : ''}>
                    <td className="doc-name">
                      <FileText size={16} className="text-muted" />
                      <span>{doc.originalFilename}</span>
                    </td>
                    <td>{doc.pageCount || '-'}</td>
                    <td>{doc.stats?.chunkCount || '-'}</td>
                    <td>
                      <div className={`status-badge ${getStatusBadgeClass(doc.status)}`}>
                        {getStatusIcon(doc.status)}
                        <span className="capitalize">{formatStatusText(doc.status)}</span>
                      </div>
                    </td>
                    <td className="text-muted text-sm">{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</td>
                    <td style={{ textAlign: 'right' }}>
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

            {/* Pagination footer */}
            <div className="pagination-footer">
              <span className="pagination-info">
                Showing {startItem}–{endItem} of {totalDocuments} document{totalDocuments !== 1 ? 's' : ''}
              </span>
              <div className="pagination-controls">
                <button
                  className="pagination-btn"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '...' ? (
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                    ) : (
                      <button
                        key={item}
                        className={`pagination-btn${currentPage === item ? ' pagination-btn-active' : ''}`}
                        onClick={() => setCurrentPage(item as number)}
                        aria-label={`Page ${item}`}
                        aria-current={currentPage === item ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  className="pagination-btn"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
