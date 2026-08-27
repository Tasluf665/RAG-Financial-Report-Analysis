import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
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

const STARTER_PROMPTS = [
  'What are the highest-priority sustainability requirements?',
  'Compare the proposed architecture approaches.',
  'Summarize key findings.'
];

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
          setMessages(data.data.messages || []);
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
          citations: data.data.assistantMessage.citations,
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

  // Render assistant content with interactive citation badges
  const renderFormattedContent = (content: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return <div className="text-content">{content}</div>;
    }

    // Split on citation markers like [1], [2], etc.
    const parts = content.split(/(\[\d+\])/g);

    return (
      <div className="text-content">
        {parts.map((part, idx) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const num = parseInt(match[1], 10);
            const matchingCitation = citations.find(c => c.citationNumber === num);

            return (
              <button
                key={idx}
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
          return <span key={idx}>{part}</span>;
        })}
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
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="source-badge-number">{selectedSourceDetail.citationNumber}</div>
                <h3>Source Details</h3>
              </div>
              <button className="action-icon-btn" onClick={() => setSelectedSourceDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>DOCUMENT</span>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>
                  {getDocName(selectedSourceDetail.documentId)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>PAGE</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0b1c30' }}>
                    Page {selectedSourceDetail.pageNumber}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>CHUNK TYPE</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0b1c30', textTransform: 'capitalize' }}>
                    {selectedSourceDetail.type}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>SIMILARITY MATCH</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>
                    {Math.round(selectedSourceDetail.score * 100)}%
                  </div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>EXTRACTED EVIDENCE</span>
                <div
                  style={{
                    marginTop: 6,
                    padding: 14,
                    background: '#eff4ff',
                    border: '1px solid #c3c6d7',
                    borderRadius: 8,
                    fontSize: 14,
                    lineHeight: '22px',
                    color: '#0b1c30',
                    fontStyle: 'italic',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  "{selectedSourceDetail.excerpt}"
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setSelectedSourceDetail(null)}
              >
                Close
              </button>
              <button
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  navigate(`/documents/${selectedSourceDetail.documentId}?chunkId=${selectedSourceDetail.chunkId}`);
                }}
              >
                <span>Open in Document Explorer</span>
                <ExternalLink size={14} />
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
