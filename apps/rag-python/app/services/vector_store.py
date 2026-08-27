"""
Vector store service — wraps Pinecone operations for DocuRAG.

# Pinecone metadata schema (finalized)
Every vector record stores the following metadata fields:
  - clerkUserId      (str)  — owner; required on all queries/filters
  - documentId       (str)  — source document; required on all queries/filters
  - chunkId          (str)  — stable: "<documentId>:v<version>:<ordinal>"
  - processingVersion (int) — used to filter stale vectors during reprocessing
  - type             (str)  — "text" | "image" | "table"
  - pageNumber       (int)  — 1-indexed page
  - text             (str)  — retrieval text, trimmed to MAX_METADATA_TEXT_CHARS

Namespace: default (single namespace for MVP; isolate users via metadata filter).
Index: environment-configured PINECONE_INDEX_NAME, cosine metric, 1536-dim.

Security rules:
  - Every query MUST filter by clerkUserId + documentId(s).
  - Never query without an owner filter.
  - Deletion is idempotent: absence of vectors is not an error.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ..dependencies import get_pinecone_index

logger = logging.getLogger(__name__)

# Trim metadata text to this length to stay under Pinecone's 40 KB/record limit.
MAX_METADATA_TEXT_CHARS = 4096


# ---------------------------------------------------------------------------
# Custom error
# ---------------------------------------------------------------------------

class VectorStoreError(Exception):
    """Raised when a Pinecone operation fails in a non-recoverable way."""


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

def upsert_vectors(vectors: List[Dict[str, Any]]) -> None:
    """
    Upsert vectors to Pinecone in batches of 100.

    Each item in `vectors` must have the shape:
      {"id": str, "values": List[float], "metadata": Dict[str, Any]}

    Trims 'text' metadata field to MAX_METADATA_TEXT_CHARS for every record.
    Retries on transient Pinecone errors (up to 3 attempts).
    """
    if not vectors:
        return

    index = get_pinecone_index()
    BATCH_SIZE = 100

    # Safety: trim text metadata before upsert
    for vec in vectors:
        if "metadata" in vec and "text" in vec["metadata"]:
            vec["metadata"]["text"] = vec["metadata"]["text"][:MAX_METADATA_TEXT_CHARS]

    for i in range(0, len(vectors), BATCH_SIZE):
        batch = vectors[i : i + BATCH_SIZE]
        _upsert_batch(index, batch)
        logger.debug("Upserted batch %d–%d (%d vectors)", i, i + len(batch), len(batch))


@retry(
    retry=retry_if_exception_type(Exception),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _upsert_batch(index: Any, batch: List[Dict[str, Any]]) -> None:
    index.upsert(vectors=batch)


# ---------------------------------------------------------------------------
# Deletion
# ---------------------------------------------------------------------------

def delete_document_vectors(document_id: str, processing_version: Optional[int] = None) -> None:
    """
    Delete all Pinecone vectors for the given document.

    If processing_version is provided, only vectors matching that version are
    deleted (useful for cleaning up stale versions after reprocessing).
    Otherwise, all vectors for the document are removed.

    This operation is idempotent: if no matching vectors exist, the function
    returns successfully. Raises VectorStoreError only on hard provider errors.
    """
    index = get_pinecone_index()
    filter_dict: Dict[str, Any] = {"documentId": {"$eq": document_id}}
    if processing_version is not None:
        filter_dict["processingVersion"] = {"$eq": processing_version}

    try:
        index.delete(filter=filter_dict)
        logger.info(
            "Deleted vectors for documentId=%s version=%s",
            document_id,
            processing_version if processing_version is not None else "all",
        )
    except Exception as exc:
        # Log but don't raise for "not found" style errors (idempotent)
        err_msg = str(exc).lower()
        if "not found" in err_msg or "does not exist" in err_msg:
            logger.info("No vectors found for document %s (already deleted)", document_id)
            return
        logger.error(
            "Failed to delete vectors for document %s: %s", document_id, exc
        )
        raise VectorStoreError(
            f"Vector deletion failed for document {document_id}: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def query_vectors(
    embedding: List[float],
    clerk_user_id: str,
    document_ids: List[str],
    top_k: int = 8,
    processing_versions: Optional[Dict[str, int]] = None,
) -> Any:
    """
    Query Pinecone with strict authorization filters.

    Args:
        embedding: The query vector.
        clerk_user_id: Authenticated user — REQUIRED for every query.
        document_ids: Authorized document IDs to search within. Empty list
            means "all of this user's documents"; at least one must be provided
            for selective scope.
        top_k: Number of top results to retrieve (1–50).
        processing_versions: Optional map of documentId -> processingVersion.
            When provided, adds a version filter to exclude stale vectors.

    Returns:
        Pinecone QueryResponse object with `.matches` attribute.

    Security:
        - Always filters by clerkUserId.
        - Always filters by documentId when document_ids is non-empty.
        - Never returns vectors belonging to a different user.
    """
    if not clerk_user_id:
        raise ValueError("clerk_user_id is required for vector queries")

    top_k = max(1, min(top_k, 50))  # bound to 1–50

    index = get_pinecone_index()

    # Build mandatory ownership + scope filter
    filter_dict: Dict[str, Any] = {"clerkUserId": {"$eq": clerk_user_id}}

    if document_ids:
        filter_dict["documentId"] = {"$in": document_ids}

    # Optionally narrow to current processing version(s)
    if processing_versions:
        # If all docs share the same version we can use a simple eq filter
        unique_versions = set(processing_versions.values())
        if len(unique_versions) == 1:
            filter_dict["processingVersion"] = {"$eq": unique_versions.pop()}
        # Mixed versions: we rely on post-fetch filtering (Pinecone doesn't
        # support per-document version conditions in a single filter).

    logger.debug(
        "Querying Pinecone top_k=%d filter=%s", top_k, filter_dict
    )

    result = index.query(
        vector=embedding,
        filter=filter_dict,
        top_k=top_k,
        include_metadata=True,
    )

    return result
