from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    RAG_HOST: str = "127.0.0.1"
    RAG_PORT: int = 8000
    INTERNAL_SERVICE_TOKEN: str = "default_secret"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_CHAT_MODEL: str = "stealth/ox-alpha"
    OPENROUTER_EMBEDDING_MODEL: str = "text-embedding-3-small"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "docurag"
    LOCAL_STORAGE_ROOT: str = "../api-node/storage"
    MAX_CONTEXT_CHUNKS: int = 8
    REQUEST_TIMEOUT_SECONDS: int = 60

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
