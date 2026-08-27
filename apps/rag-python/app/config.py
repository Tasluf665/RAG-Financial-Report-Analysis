from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Service binding
    RAG_HOST: str = "127.0.0.1"
    RAG_PORT: int = 8000

    # Security
    INTERNAL_SERVICE_TOKEN: str = "default_secret"

    # OpenRouter
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_CHAT_MODEL: str = "google/gemini-flash-1.5"
    OPENROUTER_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Pinecone
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "docurag"

    # Storage
    LOCAL_STORAGE_ROOT: str = "../api-node/storage"

    # Retrieval limits
    MAX_CONTEXT_CHUNKS: int = 8
    # Maximum characters stored per source block in the LLM context
    MAX_SOURCE_CHARS: int = 1200
    # Minimum cosine similarity score to include a retrieved chunk
    MIN_RETRIEVAL_SCORE: float = 0.35

    # Timeouts (seconds)
    EMBEDDING_TIMEOUT_SECONDS: int = 30
    CHAT_TIMEOUT_SECONDS: int = 90
    ENRICHMENT_TIMEOUT_SECONDS: int = 45
    WEBHOOK_TIMEOUT_SECONDS: int = 10

    # Retries for transient provider failures (429, 502, 503, 504)
    MAX_PROVIDER_RETRIES: int = 3

    # Node API base URL (for webhooks)
    NODE_API_BASE_URL: str = "http://127.0.0.1:4000"

    model_config = ConfigDict(env_file=".env", extra="ignore")


settings = Settings()
