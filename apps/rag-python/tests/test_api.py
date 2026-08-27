"""
Integration tests for internal FastAPI endpoints (/internal/health, /internal/query, /internal/documents/{id}/vectors).
"""

from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings

client = TestClient(app)


def test_health_endpoint_public():
    resp = client.get("/internal/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "rag-python"}


def test_query_endpoint_rejects_missing_token():
    resp = client.post(
        "/internal/query",
        json={
            "requestId": "req_1",
            "clerkUserId": "user_1",
            "documentIds": ["doc1"],
            "question": "Hello?",
        },
    )
    assert resp.status_code == 403


def test_query_endpoint_success_with_token(mock_pinecone_index, mock_embedding_client, mock_chat_client):
    # Mock embedding
    mock_emb_resp = MagicMock()
    mock_emb_resp.status_code = 200
    mock_emb_resp.json.return_value = {"data": [{"embedding": [0.1] * 1536}]}
    mock_embedding_client.post.return_value = mock_emb_resp

    # Mock Pinecone
    match = MagicMock(
        id="doc1:v1:001",
        score=0.95,
        metadata={
            "documentId": "doc1",
            "chunkId": "doc1:v1:001",
            "pageNumber": 1,
            "type": "text",
            "text": "Gross margin was 42%.",
        },
    )
    mock_pinecone_index.query.return_value = MagicMock(matches=[match])

    # Mock LLM
    mock_chat_resp = MagicMock()
    mock_chat_resp.status_code = 200
    mock_chat_resp.json.return_value = {
        "choices": [{"message": {"content": "Gross margin was 42% [1]."}}]
    }
    mock_chat_client.post.return_value = mock_chat_resp

    resp = client.post(
        "/internal/query",
        headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN},
        json={
            "requestId": "req_123",
            "clerkUserId": "user_123",
            "documentIds": ["doc1"],
            "question": "What was the gross margin?",
            "answerStyle": "concise",
            "topK": 5,
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert "Gross margin was 42% [1]." in data["answer"]
    assert len(data["sources"]) == 1
    assert data["sources"][0]["citationNumber"] == 1
    assert data["sources"][0]["chunkId"] == "doc1:v1:001"


def test_delete_vectors_endpoint(mock_pinecone_index):
    resp = client.delete(
        "/internal/documents/doc_to_delete/vectors",
        headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN},
    )
    assert resp.status_code == 204
    assert mock_pinecone_index.delete.called
