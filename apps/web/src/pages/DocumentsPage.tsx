import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  FileText, Search, ChevronDown, LayoutGrid, List,
  UploadCloud, Trash2, Eye, MoreVertical, RefreshCw,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import './Documents.css';

const PAGE_SIZE = 10;

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

type StatusFilter = 'All' | 'Ready' | 'Processing' | 'Failed';
type SortOption = 'Date Added' | 'Name' | 'Pages' | 'Chunks';

function getUploadedLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return `Today, ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d, yyyy');
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const isProcessing = status.startsWith('processing') || status === 'queued';

  if (isReady) {
    return (
      <span className="docs-badge docs-badge--ready">
        <span className="docs-badge__dot" />
        Ready
      </span>
    );
  }
  if (isFailed) {
    return (
      <span className="docs-badge docs-badge--failed">
        <span className="docs-badge__icon">✕</span>
        Failed
      </span>
    );
  }
  if (isProcessing) {
    return (
      <span className="docs-badge docs-badge--processing">
        <span className="docs-badge__spinner" />
        Processing
      </span>
    );
  }
  return <span className="docs-badge docs-badge--processing">{status}</span>;
}

function ActionMenu({
  doc,
  onExplore,
  onDelete,
  onReprocess,
}: {
  doc: Document;
  onExplore: () => void;
  onDelete: () => void;
  onReprocess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="docs-action-menu" ref={ref}>
      <button
        className="docs-action-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="docs-action-dropdown">
          <button
            className="docs-action-item"
            disabled={doc.status !== 'ready'}
            onClick={() => { setOpen(false); onExplore(); }}
          >
            <Eye size={14} /> Explore
          </button>
          <button
            className="docs-action-item"
            onClick={() => { setOpen(false); onReprocess(); }}
          >
            <RefreshCw size={14} /> Reprocess
          </button>
          <div className="docs-action-divider" />
          <button
            className="docs-action-item docs-action-item--danger"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function DocumentsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Date Added');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalDocuments / PAGE_SIZE));

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchQuery.length >= 2 ? searchQuery : '');
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(1); }, [statusFilter, sortBy]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.items ?? data);
        setTotalDocuments(data.total ?? (data.items ?? data).length);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [getToken, currentPage, debouncedSearch]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  // Client-side status filter + sort
  const filtered = documents
    .filter((d) => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Ready') return d.status === 'ready';
      if (statusFilter === 'Failed') return d.status === 'failed';
      if (statusFilter === 'Processing') return d.status.startsWith('processing') || d.status === 'queued';
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'Name') return a.originalFilename.localeCompare(b.originalFilename);
      if (sortBy === 'Pages') return (b.pageCount ?? 0) - (a.pageCount ?? 0);
      if (sortBy === 'Chunks') return (b.stats?.chunkCount ?? 0) - (a.stats?.chunkCount ?? 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleDelete = async (doc: Document) => {
    if (!window.confirm(`Delete "${doc.originalFilename}"?\n\nThis will permanently remove the document and all its data.`)) return;
    setDeletingId(doc._id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/documents/${doc._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const isLastOnPage = documents.length === 1 && currentPage > 1;
        setCurrentPage(isLastOnPage ? currentPage - 1 : currentPage);
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

  const handleReprocess = async (doc: Document) => {
    try {
      const token = await getToken();
      await fetch(`/api/documents/${doc._id}/reprocess`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setTimeout(fetchDocuments, 500);
    } catch { /* noop */ }
  };

  const startIdx = (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, totalDocuments);

  return (
    <div className="docs-page">
      {/* ── Header ── */}
      <div className="docs-header-section">
        <div className="docs-header-text">
          <h1 className="docs-title">Documents</h1>
          <p className="docs-subtitle">Manage your library of research papers, reports, and technical manuals.</p>
        </div>
        <button className="docs-upload-btn" onClick={() => navigate('/dashboard')}>
          <UploadCloud size={14} />
          Upload Document
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="docs-toolbar-section">
        <div className="docs-toolbar-left">
          {/* Search */}
          <div className="docs-search-box">
            <Search size={14} className="docs-search-icon" />
            <input
              type="text"
              className="docs-search-input"
              placeholder="Filter documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="docs-toolbar-divider" />

          {/* Status Filter */}
          <div className="docs-dropdown-wrapper">
            <button
              className="docs-filter-btn"
              onClick={() => { setShowStatusMenu((p) => !p); setShowSortMenu(false); }}
            >
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 1H14M2 5H12M4 9H10" stroke="#434655" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Status: {statusFilter}
              <ChevronDown size={10} />
            </button>
            {showStatusMenu && (
              <div className="docs-dropdown-menu">
                {(['All', 'Ready', 'Processing', 'Failed'] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    className={`docs-dropdown-item ${statusFilter === s ? 'active' : ''}`}
                    onClick={() => { setStatusFilter(s); setShowStatusMenu(false); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="docs-dropdown-wrapper">
            <button
              className="docs-filter-btn"
              onClick={() => { setShowSortMenu((p) => !p); setShowStatusMenu(false); }}
            >
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 1H10M0 5H7M0 9H4" stroke="#434655" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Sort: {sortBy}
              <ChevronDown size={10} />
            </button>
            {showSortMenu && (
              <div className="docs-dropdown-menu">
                {(['Date Added', 'Name', 'Pages', 'Chunks'] as SortOption[]).map((s) => (
                  <button
                    key={s}
                    className={`docs-dropdown-item ${sortBy === s ? 'active' : ''}`}
                    onClick={() => { setSortBy(s); setShowSortMenu(false); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="docs-toolbar-right">
          {/* View toggle */}
          <div className="docs-view-toggle">
            <button
              className={`docs-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={15} />
            </button>
            <button
              className={`docs-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <LayoutGrid size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="docs-table-section">
        <table className="docs-table">
          <thead>
            <tr className="docs-table-header-row">
              <th className="docs-th docs-th--name">Name</th>
              <th className="docs-th docs-th--num">Pages</th>
              <th className="docs-th docs-th--num">Chunks</th>
              <th className="docs-th docs-th--status">Status</th>
              <th className="docs-th docs-th--date">Uploaded</th>
              <th className="docs-th docs-th--actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="docs-state-cell">
                  <div className="docs-loading-spinner" />
                  <span>Loading documents…</span>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="docs-state-cell">
                  <FileText size={40} strokeWidth={1} style={{ color: '#c3c6d7' }} />
                  <p className="docs-empty-title">No documents found</p>
                  <p className="docs-empty-sub">
                    {searchQuery ? 'Try a different search term.' : 'Upload a PDF to get started.'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((doc) => {
                const isReady = doc.status === 'ready';
                const isProcessing = doc.status.startsWith('processing') || doc.status === 'queued';
                return (
                  <tr
                    key={doc._id}
                    className={`docs-table-row ${isReady ? 'docs-table-row--clickable' : ''} ${deletingId === doc._id ? 'docs-table-row--deleting' : ''}`}
                    onClick={() => isReady && navigate(`/documents/${doc._id}`)}
                  >
                    {/* Name */}
                    <td className="docs-td docs-td--name">
                      <div className="docs-file-cell">
                        <div className="docs-file-icon">
                          <FileText size={15} />
                        </div>
                        <div className="docs-file-info">
                          <span className={`docs-filename ${!isReady && !isProcessing ? 'docs-filename--muted' : ''}`}>
                            {doc.originalFilename}
                          </span>
                          {isProcessing && (
                            <div className="docs-progress-bar">
                              <div className="docs-progress-fill" style={{ width: '60%' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Pages */}
                    <td className="docs-td docs-td--num">
                      {doc.pageCount ?? <span className="docs-muted">—</span>}
                    </td>
                    {/* Chunks */}
                    <td className="docs-td docs-td--num">
                      {doc.stats?.chunkCount ?? <span className="docs-muted">—</span>}
                    </td>
                    {/* Status */}
                    <td className="docs-td docs-td--status">
                      <StatusBadge status={doc.status} />
                    </td>
                    {/* Uploaded */}
                    <td className="docs-td docs-td--date">
                      {getUploadedLabel(doc.createdAt)}
                    </td>
                    {/* Actions */}
                    <td className="docs-td docs-td--actions" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        doc={doc}
                        onExplore={() => navigate(`/documents/${doc._id}`)}
                        onDelete={() => handleDelete(doc)}
                        onReprocess={() => handleReprocess(doc)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {!loading && totalDocuments > PAGE_SIZE && (
          <div className="docs-table-footer">
            <span className="docs-pagination-info">
              Showing {startIdx}–{endIdx} of {totalDocuments} documents
            </span>
            <div className="docs-pagination-controls">
              <button
                className="docs-page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="docs-page-ellipsis">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`docs-page-num ${currentPage === p ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p as number)}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                className="docs-page-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
