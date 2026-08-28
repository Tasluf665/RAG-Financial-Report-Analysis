import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';
import {
  MessageSquare, Plus, Trash2, Send, Sparkles, FileText,
  Check, Copy, RefreshCw, ThumbsUp, ThumbsDown, Eye,
  SlidersHorizontal, ChevronDown, ChevronUp, X, ExternalLink,
  Info, AlertCircle
} from 'lucide-react';
import './ChatPage.css';

interface Citation {
  citationNumber: number;
  documentId: string;
  chunkId: string;
  pageNumber: number;
  type: 'text' | 'image' | 'table';
  excerpt: string;
  retrievalSummary?: string | null;
  score: number;
}

interface RetrievalStats {
  retrievedCount: number;
  usedCount: number;
  model: string;
}

interface Message {
  _id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  createdAt?: string;
  retrieval?: RetrievalStats;
}

interface Conversation {
  _id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentItem {
  _id: string;
  originalFilename: string;
  status: string;
  pageCount?: number;
}

type SourceDetailTab = 'extracted' | 'summary';

interface SourceChunk {
  _id: string;
  text: string;
  aiSummary?: string;
  retrievalSummary?: string;
  imageBase64?: string;
  tableHtml?: string;
}

const STARTER_PROMPTS = [
  'What are the highest-priority sustainability requirements?',
  'Compare the proposed architecture approaches.',
  'Summarize key findings.'
];

const normalizeCitations = (citations?: Citation[]) =>
  citations?.map((citation, index) => ({
    ...citation,
    citationNumber: citation.citationNumber || index + 1
  }));

const normalizeMessage = (message: Message): Message => ({
  ...message,
  citations: normalizeCitations(message.citations)
});

export function ChatPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Documents state for source scoping
  const [availableDocuments, setAvailableDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]); // Empty = All ready documents
  const [isManageSourcesOpen, setIsManageSourcesOpen] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');

  // Input & Generation state
  const [inputQuery, setInputQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [selectedSourceDetail, setSelectedSourceDetail] = useState<Citation | null>(null);
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null);
  const [sourceChunk, setSourceChunk] = useState<SourceChunk | null>(null);
  const [sourceChunkLoading, setSourceChunkLoading] = useState(false);
  const [sourceDetailTab, setSourceDetailTab] = useState<SourceDetailTab>('extracted');
  const [showRetrievalModal, setShowRetrievalModal] = useState<RetrievalStats | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [likedMap, setLikedMap] = useState<Record<number, 'like' | 'dislike'>>({});
  const [isTransparencyOpen, setIsTransparencyOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on message update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Load available documents for source scoping
  const fetchDocuments = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/documents?pageSize=100', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const docs: DocumentItem[] = data.items || data.data || [];
        setAvailableDocuments(docs.filter(d => d.status === 'ready'));
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [getToken]);

  // Load user conversations
  const fetchConversations = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const convList: Conversation[] = data.data || data.items || [];
        setConversations(convList);
        if (convList.length > 0 && !activeConversationId) {
          setActiveConversationId(convList[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [getToken, activeConversationId]);

  useEffect(() => {
    fetchDocuments();
    fetchConversations();
  }, [fetchDocuments, fetchConversations]);

  useEffect(() => {
    if (!selectedSourceDetail) {
      setSourcePdfUrl(null);
      setSourceChunk(null);
      return;
    }

    setSourceDetailTab('extracted');
    setSourceChunkLoading(true);

    let objectUrl: string | null = null;
    const loadSourceData = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const [fileResponse, chunksResponse] = await Promise.all([
          fetch(`/api/documents/${selectedSourceDetail.documentId}/file`, { headers }),
          fetch(`/api/documents/${selectedSourceDetail.documentId}/chunks`, { headers })
        ]);

        if (fileResponse.ok) {
          objectUrl = URL.createObjectURL(await fileResponse.blob());
          setSourcePdfUrl(objectUrl);
        }
        if (chunksResponse.ok) {
          const data = await chunksResponse.json();
          const chunk = (data.chunks || []).find((item: SourceChunk) => item._id === selectedSourceDetail.chunkId);
          setSourceChunk(chunk || null);
        }
      } catch (err) {
        console.error('Failed to load source details:', err);
      } finally {
        setSourceChunkLoading(false);
      }
    };

    loadSourceData();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedSourceDetail, getToken]);

  // Load active conversation messages
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoadingHistory(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/conversations/${activeConversationId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((data.data.messages || []).map(normalizeMessage));
        }
      } catch (err) {
        console.error('Failed to load messages for conversation:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadMessages();
  }, [activeConversationId, getToken]);

  // Create new conversation
  const handleCreateNewChat = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'New Conversation' })
      });
      if (res.ok) {
        const data = await res.json();
        const newConv = data.data;
        setConversations(prev => [newConv, ...prev]);
        setActiveConversationId(newConv._id);
        setMessages([]);
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;

    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const remaining = conversations.filter(c => c._id !== convId);
      setConversations(remaining);
      if (activeConversationId === convId) {
        setActiveConversationId(remaining.length > 0 ? remaining[0]._id : null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Send message
  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = (customMessage ?? inputQuery).trim();
    if (!textToSend || isGenerating) return;

    // If no active conversation exists, create one first
    let targetConvId = activeConversationId;
    if (!targetConvId) {
      try {
        const token = await getToken();
        if (!token) return;
        const createRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title: textToSend.slice(0, 40) })
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          targetConvId = createData.data._id;
          setActiveConversationId(targetConvId);
          setConversations(prev => [createData.data, ...prev]);
        }
      } catch (err) {
        console.error('Failed to create conversation on send:', err);
        return;
      }
    }

    if (!targetConvId) return;

    // Optimistically add user message
    const userMsg: Message = { role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsGenerating(true);

    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/conversations/${targetConvId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: textToSend,
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: Message = {
          role: 'assistant',
          content: data.data.assistantMessage.content,
          citations: normalizeCitations(data.data.assistantMessage.citations),
          retrieval: data.data.retrieval
        };
        setMessages(prev => [...prev, assistantMsg]);
        // Update conversation title if changed
        fetchConversations();
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg: Message = {
          role: 'assistant',
          content: errData.error?.message || 'Failed to generate answer. Please ensure your documents are ready and try again.'
        };
        setMessages(prev => [...prev, errMsg]);
      }
    } catch (err) {
      console.error('Error querying chat API:', err);
      const errMsg: Message = {
        role: 'assistant',
        content: 'Could not connect to the assistant server. Please check your network connection.'
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Get active citations to display in the right panel (from the last assistant message or currently selected message)
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant' && m.citations && m.citations.length > 0);
  const activeSources: Citation[] = lastAssistantMessage?.citations || [];
  const activeRetrieval: RetrievalStats | undefined = lastAssistantMessage?.retrieval;

  // Helper to get doc name by ID
  const getDocName = (docId: string) => {
    const found = availableDocuments.find(d => d._id === docId);
    return found ? found.originalFilename : docId;
  };

  // Convert citation markers to internal links so markdown can render around them.
  const prepareMarkdown = (content: string) => content.replace(/\[(\d+)\](?!\()/g, '[$1](#citation-$1)');

  // Render assistant content as markdown while keeping citations interactive.
  const renderFormattedContent = (content: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return (
        <div className="markdown-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    }

    return (
      <div className="markdown-content">
        <ReactMarkdown
          components={{
            a: ({ href, children, ...props }) => {
              const citationMatch = href?.match(/^#citation-(\d+)$/);
              if (!citationMatch) {
                return <a href={href} {...props}>{children}</a>;
              }

              const num = parseInt(citationMatch[1], 10);
              const matchingCitation = citations.find(c => c.citationNumber === num);
              return (
                <button
                  type="button"
                  className="inline-citation"
                  title={matchingCitation ? `Source ${num}: ${getDocName(matchingCitation.documentId)} (p. ${matchingCitation.pageNumber})` : `Source ${num}`}
                  onClick={() => {
                    if (matchingCitation) {
                      setActiveCitation(matchingCitation);
                      setSelectedSourceDetail(matchingCitation);
                    }
                  }}
                >
                  {num}
                </button>
              );
            }
          }}
        >
          {prepareMarkdown(content)}
        </ReactMarkdown>
      </div>
    );
  };

  // Copy message text
  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="chat-page">
      {/* Page Header Area */}
      <div className="chat-header-area">
        <div className="chat-header-left">
          <h1 className="chat-header-title">Chat with your documents</h1>
          <p className="chat-header-subtitle">Ask questions and verify every answer against its original source.</p>
        </div>

        {/* Searching In Scope Box */}
        <div className="chat-scope-box">
          <div className="chat-scope-header">
            <span className="chat-scope-label">Searching in:</span>
            <button className="btn-manage-sources" onClick={() => setIsManageSourcesOpen(true)}>
              <SlidersHorizontal size={14} />
              <span>Manage sources</span>
            </button>
          </div>
          <div className="chat-scope-pills">
            {selectedDocIds.length === 0 ? (
              <div className="scope-pill">
                <FileText size={12} />
                <span>All documents ({availableDocuments.length})</span>
              </div>
            ) : (
              selectedDocIds.map(docId => (
                <div key={docId} className="scope-pill" title={getDocName(docId)}>
                  <FileText size={12} />
                  <span>{getDocName(docId)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Two Panel Layout */}
      <div className="chat-two-panel">
        {/* Left Panel: Chat Feed */}
        <div className="chat-main-panel">
          {/* Topbar: Conversation Selector */}
          <div className="chat-panel-topbar">
            <div className="chat-conv-selector">
              <MessageSquare size={16} color="#004ac6" />
              <select
                className="conv-select-dropdown"
                value={activeConversationId || ''}
                onChange={e => setActiveConversationId(e.target.value)}
              >
                {conversations.length === 0 ? (
                  <option value="">New Conversation</option>
                ) : (
                  conversations.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.title}
                    </option>
                  ))
                )}
              </select>
              {activeConversationId && (
                <button
                  className="btn-delete-conv"
                  title="Delete this conversation"
                  onClick={e => handleDeleteConversation(activeConversationId, e)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <button className="btn-new-chat" onClick={handleCreateNewChat}>
              <Plus size={15} />
              <span>New Chat</span>
            </button>
          </div>

          {/* Messages Feed */}
          <div className="chat-messages-container">
            {availableDocuments.length === 0 && (
              <div className="sources-empty-state" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                <AlertCircle size={28} color="#ef4444" />
                <p style={{ fontWeight: 600, color: '#991b1b' }}>No ready documents found</p>
                <p style={{ fontSize: 13, color: '#7f1d1d' }}>Upload and process PDFs in your workspace before starting a chat.</p>
                <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => navigate('/documents')}>
                  Go to Documents
                </button>
              </div>
            )}

            {messages.length === 0 && !loadingHistory && availableDocuments.length > 0 && (
              <div className="chat-suggestions">
                <span className="chat-suggestions-title">Get started with a suggestion:</span>
                <div className="chat-suggestions-list">
                  {STARTER_PROMPTS.map((prompt, pIdx) => (
                    <button
                      key={pIdx}
                      className="suggestion-btn"
                      onClick={() => handleSendMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
              if (msg.role === 'user') {
                return (
                  <div key={idx} className="message-row-user">
                    <div className="user-bubble">{msg.content}</div>
                  </div>
                );
              }

              return (
                <div key={idx} className="message-row-assistant">
                  <div className="assistant-avatar">
                    <Sparkles size={16} />
                  </div>
                  <div className="assistant-bubble-container">
                    <div className="assistant-bubble">
                      {renderFormattedContent(msg.content, msg.citations)}
                    </div>
                    <div className="assistant-action-bar">
                      <span className="action-bar-left">
                        Answer generated from selected documents only.
                      </span>
                      <div className="action-bar-right">
                        <button
                          className="action-icon-btn"
                          title="Copy text"
                          onClick={() => handleCopyText(msg.content, idx)}
                        >
                          {copiedIndex === idx ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                        </button>
                        <button
                          className="action-icon-btn"
                          title="Retry"
                          onClick={() => {
                            const lastUser = [...messages.slice(0, idx)].reverse().find(m => m.role === 'user');
                            if (lastUser) handleSendMessage(lastUser.content);
                          }}
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          className="action-icon-btn"
                          title="Thumbs up"
                          onClick={() => setLikedMap(p => ({ ...p, [idx]: 'like' }))}
                          style={{ color: likedMap[idx] === 'like' ? '#2563eb' : undefined }}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          className="action-icon-btn"
                          title="Thumbs down"
                          onClick={() => setLikedMap(p => ({ ...p, [idx]: 'dislike' }))}
                          style={{ color: likedMap[idx] === 'dislike' ? '#ef4444' : undefined }}
                        >
                          <ThumbsDown size={14} />
                        </button>
                        {msg.retrieval && (
                          <button
                            className="btn-view-retrieval"
                            onClick={() => setShowRetrievalModal(msg.retrieval || null)}
                          >
                            <Eye size={14} />
                            <span>View retrieval details</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="chat-loading-row">
                <div className="bouncing-dots">
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
                <span>Searching relevant chunks...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                rows={1}
                placeholder="Ask a question about your selected documents..."
                value={inputQuery}
                onChange={e => setInputQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                className="btn-send-message"
                disabled={!inputQuery.trim() || isGenerating}
                onClick={() => handleSendMessage()}
              >
                <Send size={16} />
              </button>
            </div>
            <div className="chat-input-footnote">
              <Info size={13} />
              <span>DocuRAG answers from your selected sources and includes citations.</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Sources Used */}
        <div className="chat-sources-panel">
          <div className="sources-panel-header">
            <h2 className="sources-panel-title">Sources used</h2>
            <p className="sources-panel-subtitle">Retrieved chunks used for the current answer</p>
          </div>

          <div className="sources-cards-list">
            {activeSources.length === 0 ? (
              <div className="sources-empty-state">
                <FileText size={32} color="#94a3b8" />
                <p>No sources used yet.</p>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Ask a question to see retrieved document chunks.</p>
              </div>
            ) : (
              activeSources.map(citation => {
                const isSelected = activeCitation?.chunkId === citation.chunkId;
                const matchPercent = Math.round(citation.score * 100);

                return (
                  <div
                    key={citation.chunkId}
                    className={`source-card ${isSelected ? 'highlighted' : ''}`}
                  >
                    <div className="source-card-top">
                      <div className="source-card-doc-info">
                        <div className="source-badge-number">{citation.citationNumber}</div>
                        <FileText size={15} color="#2563eb" />
                        <span className="source-doc-name" title={getDocName(citation.documentId)}>
                          {getDocName(citation.documentId)}
                        </span>
                      </div>
                      <span className="source-match-badge">{matchPercent}% match</span>
                    </div>

                    <div className="source-meta-row">
                      Chunk {citation.chunkId.split(':').pop() || '1'}, Page {citation.pageNumber} • {citation.type.toUpperCase()}
                    </div>

                    <div className="source-excerpt-box">
                      "{citation.excerpt}"
                    </div>

                    <button
                      className="btn-view-source"
                      onClick={() => setSelectedSourceDetail(citation)}
                    >
                      View source
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Retrieval Transparency Box */}
          <div className="retrieval-transparency-box">
            <div
              className="transparency-summary"
              onClick={() => setIsTransparencyOpen(!isTransparencyOpen)}
            >
              <span>How this answer was generated</span>
              {isTransparencyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {isTransparencyOpen && (
              <div className="transparency-content">
                <div><strong>Model:</strong> {activeRetrieval?.model || 'Configured LLM'}</div>
                <div><strong>Chunks retrieved:</strong> {activeRetrieval?.retrievedCount ?? activeSources.length}</div>
                <div><strong>Chunks cited:</strong> {activeRetrieval?.usedCount ?? activeSources.length}</div>
                <div><strong>Evidence policy:</strong> Strictly grounded to context excerpts</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manage Sources Modal */}
      {isManageSourcesOpen && (
        <div className="modal-overlay" onClick={() => setIsManageSourcesOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Chat Sources</h3>
              <button className="action-icon-btn" onClick={() => setIsManageSourcesOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#434655', margin: 0 }}>
                Choose which documents the assistant will search when answering questions.
              </p>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search available documents..."
                  className="chat-textarea"
                  style={{ minHeight: 38, maxHeight: 38, border: '1px solid #c3c6d7', borderRadius: 8, padding: '8px 12px' }}
                  value={sourceSearchQuery}
                  onChange={e => setSourceSearchQuery(e.target.value)}
                />
              </div>

              <div className="doc-selection-list">
                <label className="doc-selection-item" style={{ background: selectedDocIds.length === 0 ? '#eff4ff' : undefined }}>
                  <input
                    type="checkbox"
                    checked={selectedDocIds.length === 0}
                    onChange={() => setSelectedDocIds([])}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0b1c30' }}>
                      All Documents (Default)
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Search across all {availableDocuments.length} ready documents in your library
                    </div>
                  </div>
                </label>

                {availableDocuments
                  .filter(d => d.originalFilename.toLowerCase().includes(sourceSearchQuery.toLowerCase()))
                  .map(doc => {
                    const isChecked = selectedDocIds.includes(doc._id);
                    return (
                      <label key={doc._id} className="doc-selection-item">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedDocIds(prev => prev.filter(id => id !== doc._id));
                            } else {
                              setSelectedDocIds(prev => [...prev, doc._id]);
                            }
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#0b1c30' }}>
                            {doc.originalFilename}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {doc.pageCount ? `${doc.pageCount} pages` : 'PDF'} • Ready
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setIsManageSourcesOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source Detail Modal */}
      {selectedSourceDetail && (
        <div className="modal-overlay" onClick={() => setSelectedSourceDetail(null)}>
          <div className="source-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="source-detail-header">
              <div className="source-detail-title-row">
                <div className="source-badge-number">{selectedSourceDetail.citationNumber}</div>
                <FileText size={18} color="#dc2626" />
                <h3>{getDocName(selectedSourceDetail.documentId)}</h3>
              </div>
              <div className="source-detail-meta">
                Chunk {selectedSourceDetail.chunkId.split(':').pop() || '1'}
                <span>•</span>
                Page {selectedSourceDetail.pageNumber}
                <span>•</span>
                <strong>{Math.round(selectedSourceDetail.score * 100)}% retrieval relevance</strong>
              </div>
              <button className="action-icon-btn source-detail-close" title="Close source details" onClick={() => setSelectedSourceDetail(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="source-detail-body">
              <div className="source-pdf-panel">
                {sourcePdfUrl ? (
                  <iframe
                    src={`${sourcePdfUrl}#page=${selectedSourceDetail.pageNumber}`}
                    title={`Original PDF, page ${selectedSourceDetail.pageNumber}`}
                    className="source-pdf-iframe"
                  />
                ) : (
                  <div className="source-pdf-loading">
                    <FileText size={28} />
                    <span>Loading original PDF...</span>
                  </div>
                )}
              </div>
              <div className="source-content-panel">
                <div className="source-detail-tabs">
                  <button
                    type="button"
                    className={`source-detail-tab ${sourceDetailTab === 'extracted' ? 'active' : ''}`}
                    onClick={() => setSourceDetailTab('extracted')}
                  >
                    Extracted content
                  </button>
                  <button
                    type="button"
                    className={`source-detail-tab ${sourceDetailTab === 'summary' ? 'active' : ''}`}
                    onClick={() => setSourceDetailTab('summary')}
                  >
                    AI summary
                  </button>
                </div>
                <div className="source-detail-content">
                  {sourceDetailTab === 'extracted' ? (
                    <>
                      <h4>Source Text (Chunk {selectedSourceDetail.chunkId.split(':').pop() || '1'})</h4>
                      {sourceChunkLoading ? (
                        <div className="source-evidence-text">Loading extracted content...</div>
                      ) : (
                        <>
                          {sourceChunk?.imageBase64 && (
                            <img
                              className="source-chunk-image"
                              src={`data:image/jpeg;base64,${sourceChunk.imageBase64}`}
                              alt={`Extracted content from page ${selectedSourceDetail.pageNumber}`}
                            />
                          )}
                          {sourceChunk?.tableHtml && (
                            <div className="source-chunk-table" dangerouslySetInnerHTML={{ __html: sourceChunk.tableHtml }} />
                          )}
                          <pre className="source-raw-content">{sourceChunk?.text || selectedSourceDetail.excerpt}</pre>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <h4>AI summary for retrieval</h4>
                      {sourceChunkLoading ? (
                        <div className="source-evidence-text">Loading AI summary...</div>
                      ) : (() => {
                        const summary = sourceChunk?.aiSummary?.trim() || sourceChunk?.retrievalSummary?.trim() || selectedSourceDetail.retrievalSummary?.trim();
                        return summary ? (
                          <div className="source-evidence-text source-summary-text">
                            <ReactMarkdown>{summary}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="source-evidence-text">
                            This text chunk does not have a separate AI summary. Its extracted content is embedded directly for retrieval.
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="source-detail-footer">
              <button className="btn-secondary" onClick={() => navigate(`/documents/${selectedSourceDetail.documentId}?chunkId=${selectedSourceDetail.chunkId}`)}>
                Open in chunk explorer
                <ExternalLink size={14} />
              </button>
              <button className="btn-primary" onClick={() => handleCopyText(selectedSourceDetail.excerpt, -1)}>
                <Copy size={14} />
                Copy source text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retrieval Breakdown Modal */}
      {showRetrievalModal && (
        <div className="modal-overlay" onClick={() => setShowRetrievalModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Retrieval Breakdown</h3>
              <button className="action-icon-btn" onClick={() => setShowRetrievalModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><strong>Generation Model:</strong> {showRetrievalModal.model}</div>
                <div><strong>Total Candidates Retrieved from Pinecone:</strong> {showRetrievalModal.retrievedCount}</div>
                <div><strong>Chunks Exceeding Threshold & Used in Context:</strong> {showRetrievalModal.usedCount}</div>
                <div><strong>Threshold:</strong> 0.35 Cosine Similarity</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowRetrievalModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default ChatPage;
