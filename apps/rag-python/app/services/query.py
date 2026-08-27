"""
Query pipeline — orchestrates embedding, retrieval, generation, and citation
normalization for a user's RAG question.

Pipeline steps:
  1. Validate request (non-empty question, bounded topK)
  2. Embed the question
  3. Retrieve Pinecone matches with strict auth filters
  4. Filter by minimum score; deduplicate by chunkId
  5. Build bounded context (at most MAX_CONTEXT_CHUNKS sources)
  6. If no usable chunks → return safe no-evidence response
  7. Generate answer via OpenRouter (constrained to context)
  8. Detect NO_EVIDENCE sentinel from LLM
  9. Normalize citations: parse [n] markers, validate against retrieved set,
     strip citations to non-retrieved chunks, renumber stably
 10. Return QueryResponse with normalized sources and retrieval stats
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Set, Tuple

from ..config import settings
from ..schemas import QueryRequest, QueryResponse, RetrievalStats, SourceCitation
from .embeddings import EmbeddingError, create_embedding
from .generation import NO_EVIDENCE_SENTINEL, GenerationError, generate_answer
from .vector_store import query_vectors

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_NO_EVIDENCE_MESSAGE = (
    "I could not find relevant information in the selected documents to answer your question. "
    "Please try rephrasing, or check that the documents you selected contain the relevant content."
)

# Regex to find all [n] citation markers in an answer string
_CITATION_RE = re.compile(r"\[(\d+)\]")


# ---------------------------------------------------------------------------
# Citation normalization
# ---------------------------------------------------------------------------

def _normalize_citations(
    answer: str,
    used_chunks: List[Dict[str, Any]],
) -> Tuple[str, List[int]]:
    """
    Parse [n] citation markers from the answer text and validate them against
    the list of retrieved chunks.

    Rules:
    - Preprocesses comma-separated markers like [1, 2] into [1][2].
    - Citation numbers in the answer are 1-indexed into used_chunks.
    - Any [n] where n > len(used_chunks) or n < 1 is stripped from the answer.
    - Returns (cleaned_answer, sorted list of valid citation numbers used).
    """
    # Expand comma-separated markers like [1, 2] or [1,2,3] into [1][2][3]
    answer = re.sub(
        r"\[(\d+(?:\s*,\s*\d+)+)\]",
        lambda m: "".join(f"[{x}]" for x in re.findall(r"\d+", m.group(0))),
        answer,
    )

    max_valid = len(used_chunks)
    found_numbers: Set[int] = set()

    def replace_citation(match: re.Match) -> str:  # type: ignore[type-arg]
        n = int(match.group(1))
        if 1 <= n <= max_valid:
            found_numbers.add(n)
            return f"[{n}]"
        # Strip invalid citation
        return ""

    cleaned = _CITATION_RE.sub(replace_citation, answer)
    # Remove double spaces left by stripped citations
    cleaned = re.sub(r"  +", " ", cleaned).strip()

    return cleaned, sorted(found_numbers)


def _build_source_citations(
    used_chunks: List[Dict[str, Any]],
    scores: List[float],
    valid_citation_numbers: List[int],
) -> List[SourceCitation]:
    """
    Build SourceCitation objects for all chunks actually cited in the answer.
    If the answer referenced no citations at all, include all used chunks as
    supporting sources (fallback).
    """
    # If LLM cited nothing, expose all used chunks as sources
    indices = valid_citation_numbers if valid_citation_numbers else list(range(1, len(used_chunks) + 1))

    citations: List[SourceCitation] = []
    for num in indices:
        idx = num - 1  # convert to 0-indexed
        if idx >= len(used_chunks):
            continue
        chunk = used_chunks[idx]
        score = scores[idx] if idx < len(scores) else 0.0

        excerpt = chunk.get("text", "")
        # Trim excerpt for the response
        if len(excerpt) > 500:
            excerpt = excerpt[:500] + "…"

        citations.append(
            SourceCitation(
                citationNumber=num,
                documentId=chunk.get("documentId", ""),
                chunkId=chunk.get("chunkId", ""),
                pageNumber=int(chunk.get("pageNumber", 1)),
                type=chunk.get("type", "text"),
                excerpt=excerpt,
                retrievalSummary=None,  # not stored in metadata (kept in MongoDB)
                score=round(score, 4),
            )
        )

    return citations


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def process_query(request: QueryRequest) -> QueryResponse:
    """
    Execute the full RAG query pipeline and return a QueryResponse.

    Raises:
        ValueError: for invalid input that the caller should map to HTTP 400.
        EmbeddingError: when the embedding provider fails.
        GenerationError: when the chat provider fails.
    """
    # --- 1. Validate ---
    question = (request.question or "").strip()
    if not question:
        raise ValueError("Question must not be empty")

    top_k = max(1, min(request.topK, 20))  # bound 1–20

    if not request.clerkUserId:
        raise ValueError("clerkUserId is required")

    logger.info(
        "Query requestId=%s userId=%.8s documents=%s topK=%d style=%s",
        request.requestId,
        request.clerkUserId,
        request.documentIds,
        top_k,
        request.answerStyle,
    )

    # --- 2. Embed question ---
    question_embedding = create_embedding(question)

    # --- 3. Retrieve from Pinecone ---
    pinecone_result = query_vectors(
        embedding=question_embedding,
        clerk_user_id=request.clerkUserId,
        document_ids=request.documentIds,
        top_k=top_k,
    )

    raw_matches = pinecone_result.matches if hasattr(pinecone_result, "matches") else []
    retrieved_count = len(raw_matches)
    logger.debug("Pinecone returned %d matches", retrieved_count)

    # --- 4. Filter by score and deduplicate by chunkId ---
    seen_chunk_ids: Set[str] = set()
    filtered_chunks: List[Dict[str, Any]] = []
    filtered_scores: List[float] = []

    for match in raw_matches:
        score = getattr(match, "score", 0.0)
        if score < settings.MIN_RETRIEVAL_SCORE:
            logger.debug("Dropping match score=%.4f (below threshold)", score)
            continue

        metadata = getattr(match, "metadata", {}) or {}
        chunk_id = metadata.get("chunkId", match.id if hasattr(match, "id") else "")

        if chunk_id in seen_chunk_ids:
            logger.debug("Deduplicating chunkId=%s", chunk_id)
            continue

        seen_chunk_ids.add(chunk_id)
        filtered_chunks.append(metadata)
        filtered_scores.append(score)

    # Bound to MAX_CONTEXT_CHUNKS
    context_chunks = filtered_chunks[: settings.MAX_CONTEXT_CHUNKS]
    context_scores = filtered_scores[: settings.MAX_CONTEXT_CHUNKS]
    used_count = len(context_chunks)

    logger.info(
        "Using %d/%d retrieved chunks (threshold=%.2f)",
        used_count,
        retrieved_count,
        settings.MIN_RETRIEVAL_SCORE,
    )

    # --- 5 & 6. No evidence fast-path ---
    if not context_chunks:
        return QueryResponse(
            answer=_NO_EVIDENCE_MESSAGE,
            sources=[],
            retrieval=RetrievalStats(
                retrievedCount=retrieved_count,
                usedCount=0,
                model=settings.OPENROUTER_CHAT_MODEL,
            ),
        )

    # --- 7. Generate answer ---
    raw_answer = generate_answer(question, context_chunks, request.answerStyle)

    # --- 8. Detect NO_EVIDENCE sentinel or empty response ---
    if not raw_answer or NO_EVIDENCE_SENTINEL in raw_answer:
        logger.info("LLM returned NO_EVIDENCE or empty response for requestId=%s", request.requestId)
        return QueryResponse(
            answer=_NO_EVIDENCE_MESSAGE,
            sources=[],
            retrieval=RetrievalStats(
                retrievedCount=retrieved_count,
                usedCount=used_count,
                model=settings.OPENROUTER_CHAT_MODEL,
            ),
        )

    # --- 9. Normalize citations ---
    cleaned_answer, valid_citation_numbers = _normalize_citations(raw_answer, context_chunks)
    sources = _build_source_citations(context_chunks, context_scores, valid_citation_numbers)

    logger.info(
        "Query complete requestId=%s cited_sources=%d",
        request.requestId,
        len(sources),
    )

    # --- 10. Return response ---
    return QueryResponse(
        answer=cleaned_answer,
        sources=sources,
        retrieval=RetrievalStats(
            retrievedCount=retrieved_count,
            usedCount=used_count,
            model=settings.OPENROUTER_CHAT_MODEL,
        ),
    )
