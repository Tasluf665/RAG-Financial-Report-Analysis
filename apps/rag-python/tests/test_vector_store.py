"""
Unit tests for Vector Store operations (Pinecone metadata schema, upsert, deletion, and query filters).
"""

import pytest
from unittest.mock import MagicMock
from app.services.vector_store import (
    upsert_vectors,
    delete_document_vectors,
    query_vectors,
    MAX_METADATA_TEXT_CHARS,
    VectorStoreError,
)


def test_upsert_vectors_truncates_text_and_batches(mock_pinecone_index):
    long_text = "A" * (MAX_METADATA_TEXT_CHARS + 500)
    vectors = [
        {
            "id": "doc1:v1:001",
            "values": [0.1] * 1536,
            "metadata": {
                "clerkUserId": "user_123",
                "documentId": "doc1",
                "chunkId": "doc1:v1:001",
                "processingVersion": 1,
                "type": "text",
                "pageNumber": 1,
                "text": long_text,
            },
        }
    ]

    upsert_vectors(vectors)

    assert mock_pinecone_index.upsert.called
    called_vectors = mock_pinecone_index.upsert.call_args[1]["vectors"]
    assert len(called_vectors) == 1
    assert len(called_vectors[0]["metadata"]["text"]) == MAX_METADATA_TEXT_CHARS


def test_delete_document_vectors_all_versions(mock_pinecone_index):
    delete_document_vectors("doc_xyz")

    assert mock_pinecone_index.delete.called
    called_filter = mock_pinecone_index.delete.call_args[1]["filter"]
    assert called_filter == {"documentId": {"$eq": "doc_xyz"}}


def test_delete_document_vectors_specific_version(mock_pinecone_index):
    delete_document_vectors("doc_xyz", processing_version=2)

    assert mock_pinecone_index.delete.called
    called_filter = mock_pinecone_index.delete.call_args[1]["filter"]
    assert called_filter == {
        "documentId": {"$eq": "doc_xyz"},
        "processingVersion": {"$eq": 2},
    }


def test_delete_document_vectors_idempotent_on_not_found(mock_pinecone_index):
    mock_pinecone_index.delete.side_effect = Exception("Namespace or vector not found")

    # Should not raise exception
    delete_document_vectors("doc_nonexistent")


def test_query_vectors_filter_construction(mock_pinecone_index):
    embedding = [0.05] * 1536

    # Test query with specific document scope
    query_vectors(
        embedding=embedding,
        clerk_user_id="user_abc",
        document_ids=["doc1", "doc2"],
        top_k=10,
    )

    assert mock_pinecone_index.query.called
    call_kwargs = mock_pinecone_index.query.call_args[1]
    assert call_kwargs["vector"] == embedding
    assert call_kwargs["top_k"] == 10
    assert call_kwargs["filter"] == {
        "clerkUserId": {"$eq": "user_abc"},
        "documentId": {"$in": ["doc1", "doc2"]},
    }
    assert call_kwargs["include_metadata"] is True


def test_query_vectors_requires_user_id():
    with pytest.raises(ValueError, match="clerk_user_id is required"):
        query_vectors(
            embedding=[0.1] * 1536,
            clerk_user_id="",
            document_ids=["doc1"],
        )
