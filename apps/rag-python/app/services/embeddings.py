from ..dependencies import get_embedding_model
from typing import List

def create_embeddings(texts: List[str]) -> List[List[float]]:
    """Create embeddings using configured model"""
    model = get_embedding_model()
    return model.embed_documents(texts)

def create_embedding(text: str) -> List[float]:
    """Create single embedding"""
    model = get_embedding_model()
    return model.embed_query(text)
