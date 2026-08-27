"""
DocuRAG Python RAG Service — FastAPI application entry point.

All routes are internal-only and require X-Internal-Service-Token.
The service is NOT publicly accessible — it is called only by the Node API.
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .config import settings
from .dependencies import close_clients, get_pinecone_index
from .schemas import IngestionRequest, QueryRequest, QueryResponse, ServiceError
from .services.embeddings import EmbeddingError
from .services.generation import GenerationError
from .services.ingestion import process_document
from .services.query import process_query
from .services.vector_store import VectorStoreError, delete_document_vectors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate critical settings and warm up the Pinecone connection on startup, close clients on shutdown."""
    errors: list[str] = []

    if not settings.OPENROUTER_API_KEY:
        errors.append("OPENROUTER_API_KEY is not set")
    if not settings.PINECONE_API_KEY:
        errors.append("PINECONE_API_KEY is not set")
    if settings.INTERNAL_SERVICE_TOKEN in ("default_secret", ""):
        logger.warning("INTERNAL_SERVICE_TOKEN is using the insecure default — update before production")

    if errors:
        for err in errors:
            logger.error("Startup validation failed: %s", err)
    else:
        try:
            get_pinecone_index()
            logger.info("Pinecone connection warmed up successfully")
        except Exception as exc:
            logger.error("Pinecone warm-up failed: %s", exc)

    logger.info(
        "DocuRAG RAG service starting on %s:%d", settings.RAG_HOST, settings.RAG_PORT
    )
    yield
    close_clients()
    logger.info("DocuRAG RAG service shut down")


app = FastAPI(
    title="DocuRAG Python Service",
    description="Internal RAG service — not publicly accessible",
    docs_url=None,   # Disable Swagger UI in production
    redoc_url=None,
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Internal auth dependency
# ---------------------------------------------------------------------------

def verify_internal_token(x_internal_service_token: str = Header(None)) -> None:
    if x_internal_service_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden: invalid internal service token")


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(EmbeddingError)
async def embedding_error_handler(request: Request, exc: EmbeddingError) -> JSONResponse:
    status = 503 if exc.status_code in (429, 503) else 502
    return JSONResponse(
        status_code=status,
        content=ServiceError(
            code="EMBEDDING_FAILED",
            message="Embedding provider is temporarily unavailable",
        ).model_dump(),
    )


@app.exception_handler(GenerationError)
async def generation_error_handler(request: Request, exc: GenerationError) -> JSONResponse:
    status = 503 if exc.status_code in (429, 503) else 502
    return JSONResponse(
        status_code=status,
        content=ServiceError(
            code="GENERATION_FAILED",
            message="Answer generation provider is temporarily unavailable",
        ).model_dump(),
    )


@app.exception_handler(VectorStoreError)
async def vector_store_error_handler(request: Request, exc: VectorStoreError) -> JSONResponse:
    return JSONResponse(
        status_code=502,
        content=ServiceError(
            code="VECTOR_STORE_ERROR",
            message="Vector store operation failed",
        ).model_dump(),
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content=ServiceError(
            code="INVALID_REQUEST",
            message=str(exc),
        ).model_dump(),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/internal/health")
def health_check() -> dict:
    """Liveness/readiness check — does not require auth token."""
    return {"status": "ok", "service": "rag-python"}


@app.post(
    "/internal/ingest",
    status_code=202,
    dependencies=[Depends(verify_internal_token)],
)
def ingest_document(
    request: IngestionRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept ingestion request and queue it as a background task."""
    background_tasks.add_task(process_document, request)
    return {"status": "queued", "documentId": request.documentId}


@app.post(
    "/internal/query",
    response_model=QueryResponse,
    dependencies=[Depends(verify_internal_token)],
)
def query_documents(request: QueryRequest) -> QueryResponse:
    """Embed query, retrieve chunks, generate cited answer."""
    return process_query(request)


@app.delete(
    "/internal/documents/{document_id}/vectors",
    status_code=204,
    dependencies=[Depends(verify_internal_token)],
)
def delete_vectors(document_id: str) -> None:
    """
    Remove all Pinecone vectors for the given document.
    Returns 204 No Content on success. Idempotent — safe to call if vectors
    don't exist.
    """
    delete_document_vectors(document_id)
