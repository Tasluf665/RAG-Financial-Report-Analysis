import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { FileText, Layers, HardDrive, RefreshCw, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalDocuments / PAGE_SIZE));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isHeaderUploadOpen, setIsHeaderUploadOpen] = useState(false);

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
        if (payload.metrics) {
          setTotalChunks(payload.metrics.chunkCount ?? 0);
          setTotalImages(payload.metrics.imageCount ?? 0);
          setTotalTables(payload.metrics.tableCount ?? 0);
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

  const handleDelete = async (e: React.MouseEvent, docId: string, filename: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${filename}"?\n\nThis will permanently remove the document, all its chunks, and associated data.`)) return;
    setDeletingId(docId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // If we deleted the last item on a non-first page, go back one page
        const isLastItemOnPage = documents.length === 1 && currentPage > 1;
        setCurrentPage(isLastItemOnPage ? currentPage - 1 : currentPage);
        fetchDocuments();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Failed to delete document.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

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
        <button className="btn-upload-header" onClick={() => setIsHeaderUploadOpen(true)}>
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

      {isHeaderUploadOpen && (
        <div className="sidebar-upload-overlay" onClick={() => setIsHeaderUploadOpen(false)}>
          <div className="sidebar-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-upload-title" onClick={event => event.stopPropagation()}>
            <div className="sidebar-upload-dialog-header">
              <h2 id="dashboard-upload-title">Upload documents</h2>
              <button type="button" className="sidebar-upload-close" title="Close upload dialog" aria-label="Close upload dialog" onClick={() => setIsHeaderUploadOpen(false)}>
                ×
              </button>
            </div>
            <DocumentDropzone
              inputId="dashboard-header-file-upload"
              onUploadComplete={() => {
                setIsHeaderUploadOpen(false);
                setCurrentPage(1);
                fetchDocuments();
              }}
            />
          </div>
        </div>
      )}

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
                    <td className="doc-name-cell">
                      <div className="doc-name">
                        <FileText size={16} className="text-muted" />
                        <span>{doc.originalFilename}</span>
                      </div>
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
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
                        <button
                          className="btn-danger-sm"
                          disabled={deletingId === doc._id}
                          onClick={(e) => handleDelete(e, doc._id, doc.originalFilename)}
                          title="Delete document"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
