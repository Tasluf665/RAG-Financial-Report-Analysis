"""Pydantic schemas for DocuRAG Python service request/response contracts."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

class IngestionConfig(BaseModel):
    chunkSize: int = 800
    chunkOverlap: int = 120
    summarizeImages: bool = True
    summarizeTables: bool = True
    embeddingModel: str = "default"


class IngestionRequest(BaseModel):
    documentId: str
    clerkUserId: str
    filePath: str
    processingVersion: int
    config: IngestionConfig


class ChunkManifestItem(BaseModel):
    chunkId: str
    pageNumber: int
    type: str
    content: str
    retrievalSummary: Optional[str] = None
    imageBase64: Optional[str] = None
    tableHtml: Optional[str] = None


class IngestionResponse(BaseModel):
    status: str
    documentId: str
    chunks: List[ChunkManifestItem]


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    requestId: str
    clerkUserId: str
    documentIds: List[str]
    question: str = Field(..., min_length=1, max_length=2000)
    answerStyle: str = Field("balanced", pattern="^(concise|balanced|detailed)$")
    topK: int = Field(8, ge=1, le=20)


class SourceCitation(BaseModel):
    citationNumber: int
    documentId: str
    chunkId: str
    pageNumber: int
    type: str
    excerpt: str
    retrievalSummary: Optional[str] = None
    score: float


class RetrievalStats(BaseModel):
    retrievedCount: int
    usedCount: int
    model: str


class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]
    retrieval: RetrievalStats


# ---------------------------------------------------------------------------
# Error responses
# ---------------------------------------------------------------------------

class ServiceError(BaseModel):
    """Structured error response for internal service failures."""
    code: str
    message: str
    requestId: Optional[str] = None
