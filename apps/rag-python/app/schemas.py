from pydantic import BaseModel
from typing import List, Optional

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

class QueryRequest(BaseModel):
    requestId: str
    clerkUserId: str
    documentIds: List[str]
    question: str
    answerStyle: str = "balanced"
    topK: int = 8

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
