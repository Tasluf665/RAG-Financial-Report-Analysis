"""
Dependency factories for the DocuRAG Python service.

All provider clients are created once (module-level singletons) and reused
across requests. This avoids reconnection overhead and makes mocking
straightforward in tests.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import httpx
from pinecone import Pinecone, ServerlessSpec

from .config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pinecone
# ---------------------------------------------------------------------------

_pinecone_index: Any = None  # Pinecone Index object


def get_pinecone_index() -> Any:
    """Return a cached Pinecone Index object, creating the index if needed."""
    global _pinecone_index
    if _pinecone_index is not None:
        return _pinecone_index

    if not settings.PINECONE_API_KEY:
        raise ValueError("PINECONE_API_KEY is not configured")

    pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    index_name = settings.PINECONE_INDEX_NAME

    existing = {idx.name for idx in pc.list_indexes()}
    if index_name not in existing:
        logger.info("Creating Pinecone index '%s' (cosine / 1536-dim)…", index_name)
        pc.create_index(
            name=index_name,
            dimension=1536,  # text-embedding-3-small dimension
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    _pinecone_index = pc.Index(index_name)
    logger.info("Pinecone index '%s' ready", index_name)
    return _pinecone_index


def reset_pinecone_index() -> None:
    """Reset the cached Pinecone index (useful in tests)."""
    global _pinecone_index
    _pinecone_index = None


# ---------------------------------------------------------------------------
# OpenRouter HTTPX clients
# ---------------------------------------------------------------------------

_embedding_client: httpx.Client | None = None
_chat_client: httpx.Client | None = None


def get_embedding_client() -> httpx.Client:
    """Return a cached HTTPX client configured for OpenRouter embedding calls."""
    global _embedding_client
    if _embedding_client is None or _embedding_client.is_closed:
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not configured")
        _embedding_client = httpx.Client(
            base_url=settings.OPENROUTER_BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://docurag.app",
                "X-Title": "DocuRAG",
            },
            timeout=httpx.Timeout(
                connect=5.0,
                read=float(settings.EMBEDDING_TIMEOUT_SECONDS),
                write=10.0,
                pool=5.0,
            ),
        )
    return _embedding_client


def get_chat_client() -> httpx.Client:
    """Return a cached HTTPX client configured for OpenRouter chat calls."""
    global _chat_client
    if _chat_client is None or _chat_client.is_closed:
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not configured")
        _chat_client = httpx.Client(
            base_url=settings.OPENROUTER_BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://docurag.app",
                "X-Title": "DocuRAG",
            },
            timeout=httpx.Timeout(
                connect=5.0,
                read=float(settings.CHAT_TIMEOUT_SECONDS),
                write=10.0,
                pool=5.0,
            ),
        )
    return _chat_client


def close_clients() -> None:
    """Gracefully close all HTTPX clients (call on application shutdown)."""
    global _embedding_client, _chat_client
    if _embedding_client and not _embedding_client.is_closed:
        _embedding_client.close()
    if _chat_client and not _chat_client.is_closed:
        _chat_client.close()
    _embedding_client = None
    _chat_client = None
