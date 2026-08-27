from pinecone import Pinecone
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from .config import settings

def get_pinecone_client():
    if not settings.PINECONE_API_KEY:
        raise ValueError("PINECONE_API_KEY is not set")
    return Pinecone(api_key=settings.PINECONE_API_KEY)

def get_pinecone_index():
    pc = get_pinecone_client()
    index_name = settings.PINECONE_INDEX_NAME
    
    # Check if index exists, if not create it
    existing_indexes = [index.name for index in pc.list_indexes()]
    if index_name not in existing_indexes:
        print(f"Creating Pinecone index '{index_name}' (this may take a minute)...")
        from pinecone import ServerlessSpec
        pc.create_index(
            name=index_name,
            dimension=1536, # text-embedding-3-small dimension
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1"
            )
        )
        
    return pc.Index(index_name)

def get_chat_model(temperature: float = 0.0):
    if not settings.OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")
    return ChatOpenAI(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.OPENROUTER_CHAT_MODEL,
        temperature=temperature
    )

def get_embedding_model():
    if not settings.OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")
    return OpenAIEmbeddings(
        base_url=settings.OPENROUTER_BASE_URL,
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.OPENROUTER_EMBEDDING_MODEL
    )
