import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth, UserButton } from '@clerk/clerk-react';
import { 
  ChevronRight, Search, FileText, Image as ImageIcon, LayoutGrid, FileType, 
  MessageSquare, LayoutTemplate, Brain, Database, Bell
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import './ChunkExplorer.css';

interface Chunk {
  _id: string;
  chunkIndex: number;
  type: 'Text' | 'Table' | 'Image';
  pageNumber: number;
  text: string;
  aiSummary?: string;
  imageBase64?: string;
  tableHtml?: string;
  embeddingStatus?: string;
}

interface DocumentDetail {
  _id: string;
  originalName: string;
  status: string;
  totalPages: number;
  createdAt: string;
  updatedAt: string;
  stats?: {
    chunkCount: number;
    imageCount: number;
    tableCount: number;
  };
}

type FilterType = 'All' | 'Text' | 'Image' | 'Table';
type TabType = 'Extracted Content' | 'AI Summary';

export function ChunkExplorerPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { getToken } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [filteredChunks, setFilteredChunks] = useState<Chunk[]>([]);
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [filter, setFilter] = useState<FilterType>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Extracted Content');

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      
      const docRes = await fetch(`/api/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (docRes.ok) {
        const data = await docRes.json();
        setDoc(data.data);
      }

      const chunksRes = await fetch(`/api/documents/${documentId}/chunks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (chunksRes.ok) {
        const data = await chunksRes.json();
        setChunks(data.chunks);
        setFilteredChunks(data.chunks);
        if (data.chunks.length > 0) {
          setSelectedChunk(data.chunks[0]);
        }
      }

      // Securely fetch PDF file
      const fileRes = await fetch(`/api/documents/${documentId}/file`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fileRes.ok) {
        const blob = await fileRes.blob();
        setPdfUrl(URL.createObjectURL(blob));
      }

    } catch (error) {
      console.error('Failed to fetch document details:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let result = chunks;
    if (filter !== 'All') {
      result = result.filter(c => c.type === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.text.toLowerCase().includes(q) || 
        (c.aiSummary && c.aiSummary.toLowerCase().includes(q))
      );
    }
    setFilteredChunks(result);
  }, [filter, searchQuery, chunks]);

  const getChunkIcon = (type: string) => {
    switch(type) {
      case 'Text': return <FileType size={16} />;
      case 'Image': return <ImageIcon size={16} />;
      case 'Table': return <LayoutGrid size={16} />;
      default: return <FileText size={16} />;
    }
  };

  if (loading) return <div className="explorer-loading">Loading workspace...</div>;
  if (!doc) return <div className="explorer-loading">Document not found.</div>;

  return (
    <div className="chunk-explorer-page">
      {/* Top App Bar */}
      <div className="top-app-bar">
        <div className="top-breadcrumb">
          <Link to="/dashboard" className="breadcrumb-link">Documents</Link>
          <ChevronRight size={16} className="breadcrumb-separator" />
          <span className="breadcrumb-current">{doc.originalName}</span>
        </div>
        <div className="top-actions">
          <button className="icon-button"><Bell size={18} /></button>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>

      {/* Document Header Area */}
      <div className="doc-header-area">
        <div className="doc-header-top">
          <div className="doc-title-container">
            <FileText className="doc-title-icon" size={24} />
            <h1 className="doc-title">{doc.originalName}</h1>
            <span className="doc-status-badge badge-ready">Ready</span>
          </div>
          <button className="btn-chat-primary">
            <MessageSquare size={16} /> Chat with this document
          </button>
        </div>
        <div className="doc-subtitle">
          {doc.totalPages || 0} pages · Uploaded {format(new Date(doc.createdAt), 'MMM d, yyyy')} · Last processed {formatDistanceToNow(new Date(doc.updatedAt))} ago
        </div>

        {/* Stat Cards */}
        <div className="stat-cards-container">
          <div className="stat-card">
            <div className="stat-icon-wrapper stat-icon-blue">
              <LayoutTemplate size={20} className="text-primary" />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{doc.stats?.chunkCount || 0}</h3>
              <p className="stat-label">Total Chunks</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper stat-icon-blue">
              <ImageIcon size={18} className="text-primary" />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{doc.stats?.imageCount || 0}</h3>
              <p className="stat-label">Images</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper stat-icon-blue">
              <LayoutGrid size={18} className="text-primary" />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{doc.stats?.tableCount || 0}</h3>
              <p className="stat-label">Tables</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrapper stat-icon-blue">
              <Database size={20} className="text-primary" />
            </div>
            <div className="stat-content">
              <h3 className="stat-value" style={{ fontSize: '16px', lineHeight: '24px' }}>Embeddings</h3>
              <p className="stat-label">Generated</p>
            </div>
          </div>
        </div>
      </div>

      {/* Three Panel Layout */}
      <div className="explorer-panels">
        {/* Panel 1: Chunk List */}
        <div className="panel panel-list">
          <div className="panel-list-header">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search chunks..." 
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="filter-pills">
              {['All', 'Text', 'Image', 'Table'].map(f => (
                <button 
                  key={f} 
                  className={`pill ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f as FilterType)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="chunk-list">
            {filteredChunks.map(chunk => (
              <button 
                key={chunk._id}
                className={`chunk-item ${selectedChunk?._id === chunk._id ? 'active' : ''}`}
                onClick={() => setSelectedChunk(chunk)}
              >
                <div className="chunk-item-icon">
                  {getChunkIcon(chunk.type)}
                </div>
                <div className="chunk-item-content">
                  <div className="chunk-item-top">
                    <span className="chunk-title">Chunk {chunk.chunkIndex}</span>
                    <span className="chunk-page">Pg {chunk.pageNumber}</span>
                  </div>
                  <div className="chunk-snippet">
                    {chunk.aiSummary ? chunk.aiSummary.substring(0, 50) + '...' : chunk.text.substring(0, 50) + '...'}
                  </div>
                </div>
                {selectedChunk?._id === chunk._id && <div className="chunk-item-active-border" />}
              </button>
            ))}
            {filteredChunks.length === 0 && (
              <div className="no-chunks">No chunks match your search.</div>
            )}
          </div>
        </div>

        {/* Panel 2: Chunk Detail */}
        <div className="panel panel-detail">
          {selectedChunk ? (
            <div className="detail-container">
              <div className="detail-header-top">
                <h2 className="detail-title">Chunk {selectedChunk.chunkIndex}</h2>
                <div className="detail-tags">
                  <span className="detail-tag tag-type">
                    {getChunkIcon(selectedChunk.type)} {selectedChunk.type}
                  </span>
                  <span className="detail-tag tag-page">
                    <FileText size={12} /> Page {selectedChunk.pageNumber}
                  </span>
                  <span className="detail-tag tag-embed">
                    <Database size={12} /> Embedded
                  </span>
                  {selectedChunk.aiSummary && (
                    <span className="detail-tag tag-ai">
                      <Brain size={12} /> AI Summarized
                    </span>
                  )}
                </div>
              </div>
              
              <div className="detail-tabs">
                <button 
                  className={`detail-tab ${activeTab === 'Extracted Content' ? 'active' : ''}`}
                  onClick={() => setActiveTab('Extracted Content')}
                >
                  Extracted Content
                </button>
                <button 
                  className={`detail-tab ${activeTab === 'AI Summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('AI Summary')}
                >
                  AI Summary
                </button>
              </div>

              <div className="detail-body">
                {activeTab === 'Extracted Content' && (
                  <div className="extracted-content-view">
                    {(selectedChunk.imageBase64 || selectedChunk.tableHtml) && (
                      <div className="visual-preview-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
                        {selectedChunk.imageBase64 && (
                          <div className="image-preview-container">
                            <img 
                              src={`data:image/jpeg;base64,${selectedChunk.imageBase64}`} 
                              alt={`Chunk ${selectedChunk.chunkIndex}`} 
                              style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} 
                            />
                          </div>
                        )}
                        {selectedChunk.tableHtml && (
                          <div className="table-preview-container" style={{ overflowX: 'auto', background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #c3c6d7' }}>
                            <div dangerouslySetInnerHTML={{ __html: selectedChunk.tableHtml }} />
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="extracted-text-box">
                      <div className="box-title-container">
                        <FileType size={16} className="text-secondary" />
                        <h4 className="box-title">Raw Content Payload</h4>
                      </div>
                      <pre className="raw-text">{selectedChunk.text}</pre>
                    </div>
                  </div>
                )}
                {activeTab === 'AI Summary' && (
                  <div className="ai-summary-view">
                    {selectedChunk.aiSummary ? (
                      <div className="ai-summary-box">
                        <div className="box-title-container">
                          <Brain size={16} className="text-primary" />
                          <h4 className="box-title">AI Summary for Retrieval</h4>
                        </div>
                        <div className="markdown-content">
                          <ReactMarkdown>{selectedChunk.aiSummary}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted text-sm" style={{ padding: '20px' }}>No AI summary generated for this chunk. Text-only chunks are embedded directly.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="detail-empty">Select a chunk to view details</div>
          )}
        </div>

        {/* Panel 3: PDF Preview */}
        <div className="panel panel-preview">
          <div className="preview-header">
            <h3>Source Document</h3>
          </div>
          <div className="preview-frame-container">
            {pdfUrl ? (
              <iframe 
                src={`${pdfUrl}${selectedChunk ? `#page=${selectedChunk.pageNumber}` : ''}`}
                title="PDF Preview"
                className="pdf-iframe"
              />
            ) : (
              <div className="detail-empty">Loading document preview...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

