"""
Shared test fixtures and mocks for DocuRAG Python service tests.
"""

from __future__ import annotations

import os
import pytest
from unittest.mock import MagicMock

# Set required test environment variables before importing app modules
os.environ["INTERNAL_SERVICE_TOKEN"] = "test_internal_token_123"
os.environ["OPENROUTER_API_KEY"] = "test_openrouter_key"
os.environ["PINECONE_API_KEY"] = "test_pinecone_key"
os.environ["PINECONE_INDEX_NAME"] = "test-docurag"
os.environ["OPENROUTER_CHAT_MODEL"] = "google/gemini-flash-1.5"
os.environ["OPENROUTER_EMBEDDING_MODEL"] = "text-embedding-3-small"
os.environ["NODE_API_BASE_URL"] = "http://127.0.0.1:4000"


@pytest.fixture(autouse=True)
def mock_dependencies(monkeypatch):
    """Automatically mock Pinecone and OpenRouter clients for all tests."""
    mock_idx = MagicMock()
    mock_idx.upsert = MagicMock(return_value={"upserted_count": 1})
    mock_idx.delete = MagicMock(return_value={})
    mock_idx.query = MagicMock(return_value=MagicMock(matches=[]))

    mock_emb = MagicMock()
    mock_chat = MagicMock()

    import app.dependencies as deps
    deps._pinecone_index = mock_idx
    deps._embedding_client = mock_emb
    deps._chat_client = mock_chat

    monkeypatch.setattr(deps, "get_pinecone_index", lambda: mock_idx)
    monkeypatch.setattr(deps, "get_embedding_client", lambda: mock_emb)
    monkeypatch.setattr(deps, "get_chat_client", lambda: mock_chat)

    import app.services.vector_store as vs
    monkeypatch.setattr(vs, "get_pinecone_index", lambda: mock_idx)

    import app.services.embeddings as emb_svc
    monkeypatch.setattr(emb_svc, "get_embedding_client", lambda: mock_emb)

    import app.services.generation as gen_svc
    monkeypatch.setattr(gen_svc, "get_chat_client", lambda: mock_chat)


@pytest.fixture
def mock_pinecone_index():
    import app.dependencies as deps
    return deps._pinecone_index


@pytest.fixture
def mock_embedding_client():
    import app.dependencies as deps
    return deps._embedding_client


@pytest.fixture
def mock_chat_client():
    import app.dependencies as deps
    return deps._chat_client
