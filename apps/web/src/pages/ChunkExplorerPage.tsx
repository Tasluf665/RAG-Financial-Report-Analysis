import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ChevronRight, Search, FileText, Image as ImageIcon, LayoutGrid, FileType } from 'lucide-react';
import { format } from 'date-fns';
import './ChunkExplorer.css';

interface Chunk {
  _id: string;
  chunkIndex: number;
  type: 'Text' | 'Table' | 'Image';
  pageNumber: number;
  text: string;
  aiSummary?: string;
}

interface DocumentDetail {
  _id: string;
  originalName: string;
  status: string;
  totalPages: number;
  createdAt: string;
  updatedAt: string;
}

type FilterType = 'All' | 'Text' | 'Image' | 'Table';

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

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      
      const docRes = await fetch(`/api/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (docRes.ok) {
        const data = await docRes.json();
        setDoc(data.document);
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
      <div className="explorer-header">
        <div className="breadcrumb">
          <Link to="/dashboard" className="breadcrumb-link">Documents</Link>
          <ChevronRight size={16} className="breadcrumb-separator" />
          <span className="breadcrumb-current">{doc.originalName}</span>
        </div>
      </div>
      
      <div className="doc-meta-header">
        <div className="meta-left">
          <FileText className="meta-icon text-primary" size={24} />
          <h1 className="meta-title">{doc.originalName}</h1>
          <span className="meta-status badge-success">Ready</span>
        </div>
        <div className="meta-right">
          <span className="meta-subtitle">
            {doc.totalPages || 0} pages · Uploaded {format(new Date(doc.createdAt), 'MMM d, yyyy')}
          </span>
          <button className="btn-chat">
            <LayoutGrid size={16} /> Chat with this document
          </button>
        </div>
      </div>

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
            <div className="detail-content">
              <h2 className="detail-title">Chunk {selectedChunk.chunkIndex}</h2>
              <div className="detail-tags">
                <span className="tag"><FileType size={14} /> {selectedChunk.type}</span>
                <span className="tag">Page {selectedChunk.pageNumber}</span>
                {selectedChunk.aiSummary && <span className="tag tag-ai">AI Summarized</span>}
              </div>
              
              <div className="detail-body">
                {selectedChunk.aiSummary && (
                  <div className="ai-summary-box">
                    <h4 className="box-title">AI Summary</h4>
                    <p>{selectedChunk.aiSummary}</p>
                  </div>
                )}
                
                <div className="extracted-text-box">
                  <h4 className="box-title">Extracted Raw Text</h4>
                  <pre className="raw-text">{selectedChunk.text}</pre>
                </div>
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
