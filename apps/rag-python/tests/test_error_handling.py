"""
Unit tests for provider timeouts, retries, and error mapping.
"""

from unittest.mock import MagicMock
import httpx
import pytest

from app.services.embeddings import create_embedding, EmbeddingError
from app.services.generation import generate_answer, GenerationError


def test_embedding_error_on_provider_500(mock_embedding_client):
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = "Internal OpenRouter Error"
    mock_embedding_client.post.return_value = mock_resp

    with pytest.raises(EmbeddingError) as exc_info:
        create_embedding("test query")

    assert "OpenRouter embedding error" in str(exc_info.value)


def test_generation_error_on_timeout(mock_chat_client):
    mock_chat_client.post.side_effect = httpx.TimeoutException("Timeout")

    with pytest.raises(GenerationError) as exc_info:
        generate_answer("test question", [{"text": "sample"}])

    assert "timed out" in str(exc_info.value)


def test_generation_error_on_connect_error(mock_chat_client):
    mock_chat_client.post.side_effect = httpx.ConnectError("Connection refused")

    with pytest.raises(GenerationError) as exc_info:
        generate_answer("test question", [{"text": "sample"}])

    assert "connect" in str(exc_info.value).lower()
