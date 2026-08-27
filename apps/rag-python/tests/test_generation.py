"""
Unit tests for answer generation, context builder, and prompting.
"""

from unittest.mock import MagicMock
from app.services.generation import build_context_blocks, generate_answer
from app.config import settings


def test_build_context_blocks_formatting_and_bounding():
    context_chunks = [
        {
            "chunkId": "doc1:v1:001",
            "type": "text",
            "pageNumber": 3,
            "text": "Total revenue for Q3 was $4.2M.",
        },
        {
            "chunkId": "doc1:v1:002",
            "type": "table",
            "pageNumber": 5,
            "text": "X" * (settings.MAX_SOURCE_CHARS + 200),  # exceeds max chars
        },
    ]

    blocks = build_context_blocks(context_chunks)

    assert "--- Source [1] ---" in blocks
    assert "Type: text" in blocks
    assert "Page: 3" in blocks
    assert "Content: Total revenue for Q3 was $4.2M." in blocks

    assert "--- Source [2] ---" in blocks
    assert "Type: table" in blocks
    assert "Page: 5" in blocks
    assert "…" in blocks  # Truncation ellipsis


def test_generate_answer_invokes_chat_api(mock_chat_client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "Revenue was $4.2M [1].",
                }
            }
        ]
    }
    mock_chat_client.post.return_value = mock_resp

    context_chunks = [
        {"chunkId": "doc1:v1:001", "type": "text", "pageNumber": 3, "text": "Revenue: $4.2M"}
    ]

    answer = generate_answer("What was the revenue?", context_chunks, answer_style="concise")

    assert answer == "Revenue was $4.2M [1]."
    assert mock_chat_client.post.called
    call_json = mock_chat_client.post.call_args[1]["json"]
    assert call_json["model"] == settings.OPENROUTER_CHAT_MODEL
    assert call_json["temperature"] == 0.0
    # Check concise style was injected
    assert "CONCISE" in call_json["messages"][0]["content"]
