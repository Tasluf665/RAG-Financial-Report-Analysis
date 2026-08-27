"""
Answer generation service — produces source-grounded answers via OpenRouter.

Uses direct HTTPX calls with tenacity retries for transient provider failures.
The answer prompt is loaded from prompts/answer.md to keep prompt engineering
separate from business logic.

Citation normalization (validating [n] markers against retrieved chunks) is
handled in query.py, not here. This module only produces the raw answer string.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from ..config import settings
from ..dependencies import get_chat_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load system prompt from file
# ---------------------------------------------------------------------------

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "answer.md"
_SYSTEM_PROMPT: str | None = None


def _get_system_prompt() -> str:
    global _SYSTEM_PROMPT
    if _SYSTEM_PROMPT is None:
        _SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")
    return _SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Sentinel for no-evidence responses
# ---------------------------------------------------------------------------

NO_EVIDENCE_SENTINEL = "NO_EVIDENCE"

TRANSIENT_STATUS_CODES = {429, 502, 503, 504}


# ---------------------------------------------------------------------------
# Custom error
# ---------------------------------------------------------------------------

class GenerationError(Exception):
    """Raised when the chat provider returns an unrecoverable error."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, GenerationError) and exc.status_code in TRANSIENT_STATUS_CODES:
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    return False


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def build_context_blocks(context_chunks: List[Dict[str, Any]]) -> str:
    """
    Build numbered source blocks for the LLM context.

    Each block is bounded to settings.MAX_SOURCE_CHARS characters to keep
    the total prompt within provider limits.
    """
    lines: List[str] = ["SOURCES:\n"]
    for idx, chunk in enumerate(context_chunks):
        citation_num = idx + 1
        chunk_type = chunk.get("type", "text")
        page = chunk.get("pageNumber", "?")
        text = chunk.get("text", "")

        # Trim to MAX_SOURCE_CHARS
        if len(text) > settings.MAX_SOURCE_CHARS:
            text = text[: settings.MAX_SOURCE_CHARS] + "…"

        lines.append(f"--- Source [{citation_num}] ---")
        lines.append(f"Type: {chunk_type}")
        lines.append(f"Page: {page}")
        lines.append(f"Content: {text}")
        lines.append("")  # blank line between sources

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Provider call with retry
# ---------------------------------------------------------------------------

@retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(settings.MAX_PROVIDER_RETRIES),
    wait=wait_exponential(multiplier=1, min=2, max=15),
    reraise=True,
)
def _call_chat_api(messages: List[Dict[str, str]]) -> str:
    """
    POST to OpenRouter /chat/completions and return the assistant message content.
    Raises GenerationError on non-2xx responses or malformed output.
    """
    client = get_chat_client()
    payload = {
        "model": settings.OPENROUTER_CHAT_MODEL,
        "messages": messages,
        "temperature": 0.0,
        "max_tokens": 2048,
    }

    try:
        response = client.post("/chat/completions", json=payload)
    except httpx.TimeoutException as exc:
        raise GenerationError(
            f"Chat request timed out after {settings.CHAT_TIMEOUT_SECONDS}s"
        ) from exc
    except httpx.ConnectError as exc:
        raise GenerationError("Could not connect to OpenRouter chat endpoint") from exc

    if response.status_code not in range(200, 300):
        raise GenerationError(
            f"OpenRouter chat error {response.status_code}: {response.text[:300]}",
            status_code=response.status_code,
        )

    body = response.json()

    # Validate response shape
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GenerationError(
            f"Malformed OpenRouter chat response: {str(body)[:300]}"
        ) from exc

    if not isinstance(content, str):
        raise GenerationError(
            f"Expected string content from OpenRouter, got {type(content).__name__}"
        )

    return content.strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_answer(
    question: str,
    context_chunks: List[Dict[str, Any]],
    answer_style: str = "balanced",
) -> str:
    """
    Generate an answer grounded in the provided context chunks.

    Returns the raw answer string (may contain [n] citation markers and the
    NO_EVIDENCE sentinel). Citation normalization is done in query.py.

    Raises GenerationError on unrecoverable provider failures.
    """
    system_prompt = _get_system_prompt()

    # Append style instruction to system prompt
    style_note = {
        "concise": "\n\nAnswer style: CONCISE — 1 to 3 sentences maximum.",
        "detailed": "\n\nAnswer style: DETAILED — thorough, use subheadings where helpful.",
        "balanced": "\n\nAnswer style: BALANCED — a few focused paragraphs.",
    }.get(answer_style, "")
    if style_note:
        system_prompt = system_prompt + style_note

    context_text = build_context_blocks(context_chunks)
    user_prompt = f"{context_text}\n\nQuestion: {question}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    return _call_chat_api(messages)
