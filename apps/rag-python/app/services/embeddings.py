"""
Embedding service — creates vector representations via OpenRouter.

Uses direct HTTPX calls (no LangChain) with tenacity retries for transient
provider failures (429 / 502 / 503 / 504). Raises EmbeddingError on
unrecoverable failures so callers can map to safe user-facing errors.
"""

from __future__ import annotations

import logging
from typing import List

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from ..config import settings
from ..dependencies import get_embedding_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom error
# ---------------------------------------------------------------------------

TRANSIENT_STATUS_CODES = {429, 502, 503, 504}


class EmbeddingError(Exception):
    """Raised when the embedding provider returns an unrecoverable error."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _is_transient(exc: BaseException) -> bool:
    """Return True if the exception represents a retryable provider failure."""
    if isinstance(exc, EmbeddingError) and exc.status_code in TRANSIENT_STATUS_CODES:
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    return False


# ---------------------------------------------------------------------------
# Provider call with retry
# ---------------------------------------------------------------------------

@retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(settings.MAX_PROVIDER_RETRIES),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _call_embeddings_api(texts: List[str]) -> List[List[float]]:
    """
    POST to OpenRouter /embeddings and return a list of embedding vectors.
    Raises EmbeddingError on non-2xx responses.
    """
    client = get_embedding_client()
    payload = {
        "model": settings.OPENROUTER_EMBEDDING_MODEL,
        "input": texts,
    }

    try:
        response = client.post("/embeddings", json=payload)
    except httpx.TimeoutException as exc:
        raise EmbeddingError(
            f"Embedding request timed out after {settings.EMBEDDING_TIMEOUT_SECONDS}s"
        ) from exc
    except httpx.ConnectError as exc:
        raise EmbeddingError("Could not connect to OpenRouter embedding endpoint") from exc

    if response.status_code not in range(200, 300):
        raise EmbeddingError(
            f"OpenRouter embedding error {response.status_code}: {response.text[:300]}",
            status_code=response.status_code,
        )

    body = response.json()

    # Validate response shape
    if "data" not in body or not isinstance(body["data"], list):
        raise EmbeddingError(
            f"Unexpected embedding response shape: {str(body)[:200]}"
        )

    data = body["data"]
    if len(data) != len(texts):
        raise EmbeddingError(
            f"Expected {len(texts)} embeddings, got {len(data)}"
        )

    try:
        vectors = [item["embedding"] for item in data]
    except (KeyError, TypeError) as exc:
        raise EmbeddingError(
            f"Malformed embedding objects in response: {exc}"
        ) from exc

    return vectors


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Create embeddings for a list of texts.

    Batches calls in groups of 96 to stay within provider limits.
    Raises EmbeddingError on failure.
    """
    if not texts:
        return []

    BATCH_SIZE = 96
    all_vectors: List[List[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        logger.debug("Embedding batch %d/%d (%d texts)…", i // BATCH_SIZE + 1, -(-len(texts) // BATCH_SIZE), len(batch))
        vectors = _call_embeddings_api(batch)
        all_vectors.extend(vectors)

    return all_vectors


def create_embedding(text: str) -> List[float]:
    """
    Create a single embedding for the given text.
    Raises EmbeddingError on failure.
    """
    vectors = _call_embeddings_api([text])
    return vectors[0]
