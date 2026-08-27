"""
Enrichment service — generates AI retrieval summaries for visual content
(images, tables) to improve embedding quality for non-textual chunks.

Uses direct HTTPX calls to OpenRouter (replaces LangChain). Falls back
gracefully to a text-based summary if the vision call fails, so ingestion
is never blocked by enrichment failures.
"""

from __future__ import annotations

import logging
from typing import List

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from ..config import settings
from ..dependencies import get_chat_client

logger = logging.getLogger(__name__)

TRANSIENT_STATUS_CODES = {429, 502, 503, 504}

_IMAGE_TABLE_SYSTEM_PROMPT = """You are creating a searchable retrieval description for financial document content.

Your description will be embedded as a vector and used to match relevant user questions.

Requirements:
- Describe key facts, numbers, and data points from text and tables
- Identify main topics and concepts
- Note questions this content could answer
- For visual content: describe visible entities, labels, axes, relationships, key values
- Do not invent information not present in the source
- Keep the description concise (3–8 sentences) and retrieval-focused
- State uncertainty if content is unreadable
"""


class EnrichmentError(Exception):
    """Raised when AI enrichment fails and no fallback is possible."""


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TimeoutException) or isinstance(exc, httpx.ConnectError):
        return True
    if isinstance(exc, EnrichmentError):
        return False
    return False


@retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=False,
)
def _call_enrichment_api(
    text: str,
    tables: List[str],
    images: List[str],
) -> str | None:
    """
    Call OpenRouter chat with optional image attachments.
    Returns the assistant's summary string, or None on failure.
    """
    client = get_chat_client()

    # Build user message with multimodal content
    content_parts: List[dict] = []

    prompt_text = _IMAGE_TABLE_SYSTEM_PROMPT + "\n\nCONTENT TO ANALYZE:\n"
    if text:
        prompt_text += f"TEXT:\n{text[:2000]}\n\n"
    for i, table in enumerate(tables):
        prompt_text += f"TABLE {i + 1}:\n{table[:1000]}\n\n"
    prompt_text += "SEARCHABLE DESCRIPTION:"

    content_parts.append({"type": "text", "text": prompt_text})

    for image_base64 in images[:3]:  # cap at 3 images per chunk
        content_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
        })

    payload = {
        "model": settings.OPENROUTER_CHAT_MODEL,
        "messages": [{"role": "user", "content": content_parts}],
        "temperature": 0.2,
        "max_tokens": 512,
    }

    try:
        timeout = httpx.Timeout(
            connect=5.0,
            read=float(settings.ENRICHMENT_TIMEOUT_SECONDS),
            write=10.0,
            pool=5.0,
        )
        response = client.post("/chat/completions", json=payload, timeout=timeout)
    except httpx.TimeoutException:
        logger.warning("Enrichment request timed out")
        return None
    except httpx.ConnectError:
        logger.warning("Enrichment connection error")
        return None

    if response.status_code not in range(200, 300):
        logger.warning(
            "Enrichment API error %d: %s",
            response.status_code,
            response.text[:200],
        )
        return None

    try:
        return response.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Malformed enrichment response: %s", exc)
        return None


def create_ai_enhanced_summary(
    text: str,
    tables: List[str],
    images: List[str],
) -> str:
    """
    Create an AI-enhanced retrieval summary for mixed/visual content.

    Falls back to a text-based summary if the AI call fails, so ingestion
    is never blocked.
    """
    result = _call_enrichment_api(text, tables, images)

    if result:
        return result

    # Safe fallback: construct summary from available text
    logger.info("Using text fallback for enrichment summary")
    summary = text[:400].strip() if text else ""
    if tables:
        summary += f" [Contains {len(tables)} table(s)]"
    if images:
        summary += f" [Contains {len(images)} image(s)]"
    return summary or "[Visual content — no text extractable]"
