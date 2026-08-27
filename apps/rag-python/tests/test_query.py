"""
Unit & integration tests for the full query pipeline (citation normalization, score filtering, safe no-evidence, deduplication).
"""

from unittest.mock import MagicMock
import pytest

from app.schemas import QueryRequest
from app.services.query import _normalize_citations, _build_source_citations, process_query


def test_normalize_citations_valid_and_invalid():
    used_chunks = [{"chunkId": "c1"}, {"chunkId": "c2"}]

    # Answer contains valid [1], out-of-range [5], and invalid [0]
    raw_answer = "Fact one [1], hallucinated fact [5], another fact [2], invalid [0]."
    cleaned, valid_nums = _normalize_citations(raw_answer, used_chunks)

    assert "[1]" in cleaned
    assert "[2]" in cleaned
    assert "[5]" not in cleaned
    assert "[0]" not in cleaned
    assert valid_nums == [1, 2]


def test_normalize_citations_comma_separated():
    used_chunks = [{"chunkId": "c1"}, {"chunkId": "c2"}]

    raw_answer = "This finding is supported by multiple sources [1, 2]."
    cleaned, valid_nums = _normalize_citations(raw_answer, used_chunks)

    assert "[1][2]" in cleaned
    assert valid_nums == [1, 2]


def test_build_source_citations():
    used_chunks = [
        {
            "documentId": "doc1",
            "chunkId": "doc1:v1:001",
            "pageNumber": 2,
            "type": "text",
            "text": "Gross margin increased to 45%.",
        },
        {
            "documentId": "doc1",
            "chunkId": "doc1:v1:002",
            "pageNumber": 3,
            "type": "table",
            "text": "Table content...",
        },
    ]
    scores = [0.92, 0.78]

    # Only source 1 was cited
    citations = _build_source_citations(used_chunks, scores, valid_citation_numbers=[1])

    assert len(citations) == 1
    assert citations[0].citationNumber == 1
    assert citations[0].chunkId == "doc1:v1:001"
    assert citations[0].documentId == "doc1"
    assert citations[0].pageNumber == 2
    assert citations[0].type == "text"
    assert citations[0].score == 0.92


def test_process_query_no_evidence_below_threshold(
    mock_pinecone_index, mock_embedding_client, monkeypatch
):
    # Mock embedding response
    mock_emb_resp = MagicMock()
    mock_emb_resp.status_code = 200
    mock_emb_resp.json.return_value = {"data": [{"embedding": [0.1] * 1536}]}
    mock_embedding_client.post.return_value = mock_emb_resp

    # Matches with score below MIN_RETRIEVAL_SCORE (0.35)
    low_match = MagicMock(id="c1", score=0.20, metadata={"chunkId": "c1", "text": "Low score text"})
    mock_pinecone_index.query.return_value = MagicMock(matches=[low_match])

    req = QueryRequest(
        requestId="req_test_1",
        clerkUserId="user_test",
        documentIds=["doc1"],
        question="What is the net income?",
        answerStyle="balanced",
        topK=5,
    )

    resp = process_query(req)

    assert "could not find relevant information" in resp.answer.lower()
    assert len(resp.sources) == 0
    assert resp.retrieval.usedCount == 0
    assert resp.retrieval.retrievedCount == 1


def test_process_query_llm_returns_no_evidence(
    mock_pinecone_index, mock_embedding_client, mock_chat_client
):
    # Mock embedding response
    mock_emb_resp = MagicMock()
    mock_emb_resp.status_code = 200
    mock_emb_resp.json.return_value = {"data": [{"embedding": [0.1] * 1536}]}
    mock_embedding_client.post.return_value = mock_emb_resp

    # Good match from Pinecone
    good_match = MagicMock(
        id="c1",
        score=0.85,
        metadata={
            "documentId": "doc1",
            "chunkId": "c1",
            "pageNumber": 1,
            "type": "text",
            "text": "General company overview without financials.",
        },
    )
    mock_pinecone_index.query.return_value = MagicMock(matches=[good_match])

    # LLM returns NO_EVIDENCE sentinel
    mock_chat_resp = MagicMock()
    mock_chat_resp.status_code = 200
    mock_chat_resp.json.return_value = {
        "choices": [{"message": {"content": "NO_EVIDENCE"}}]
    }
    mock_chat_client.post.return_value = mock_chat_resp

    req = QueryRequest(
        requestId="req_test_2",
        clerkUserId="user_test",
        documentIds=["doc1"],
        question="What is the EBITDA in 2025?",
        answerStyle="concise",
        topK=5,
    )

    resp = process_query(req)

    assert "could not find relevant information" in resp.answer.lower()
    assert len(resp.sources) == 0


def test_process_query_successful_with_citations(
    mock_pinecone_index, mock_embedding_client, mock_chat_client
):
    # Mock embedding
    mock_emb_resp = MagicMock()
    mock_emb_resp.status_code = 200
    mock_emb_resp.json.return_value = {"data": [{"embedding": [0.1] * 1536}]}
    mock_embedding_client.post.return_value = mock_emb_resp

    # 2 matches
    match1 = MagicMock(
        id="doc1:v1:001",
        score=0.91,
        metadata={
            "documentId": "doc1",
            "chunkId": "doc1:v1:001",
            "pageNumber": 4,
            "type": "text",
            "text": "Operating income reached $12M in FY24.",
        },
    )
    match2 = MagicMock(
        id="doc1:v1:002",
        score=0.82,
        metadata={
            "documentId": "doc1",
            "chunkId": "doc1:v1:002",
            "pageNumber": 6,
            "type": "table",
            "text": "Segment revenue breakdown table.",
        },
    )
    mock_pinecone_index.query.return_value = MagicMock(matches=[match1, match2])

    # Mock chat LLM
    mock_chat_resp = MagicMock()
    mock_chat_resp.status_code = 200
    mock_chat_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "Operating income was $12M in FY24 [1]. Segment breakdown is detailed in [2].",
                }
            }
        ]
    }
    mock_chat_client.post.return_value = mock_chat_resp

    req = QueryRequest(
        requestId="req_test_3",
        clerkUserId="user_test",
        documentIds=["doc1"],
        question="What was operating income?",
        answerStyle="balanced",
        topK=5,
    )

    resp = process_query(req)

    assert "[1]" in resp.answer
    assert "[2]" in resp.answer
    assert len(resp.sources) == 2
    assert resp.sources[0].citationNumber == 1
    assert resp.sources[0].chunkId == "doc1:v1:001"
    assert resp.sources[1].citationNumber == 2
    assert resp.sources[1].chunkId == "doc1:v1:002"
    assert resp.retrieval.usedCount == 2
    assert resp.retrieval.retrievedCount == 2
