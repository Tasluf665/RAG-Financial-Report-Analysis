from ..dependencies import get_pinecone_index
from typing import List, Dict, Any

def upsert_vectors(vectors: List[Dict[str, Any]]):
    """Upsert vectors into Pinecone"""
    index = get_pinecone_index()
    # Batch upsert in chunks of 100
    batch_size = 100
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch)

def delete_document_vectors(document_id: str):
    """Delete all vectors for a specific document"""
    index = get_pinecone_index()
    try:
        # Note: delete by metadata filter is only supported on Pinecone serverless or specific pod types
        # Using a generalized delete by filter
        index.delete(filter={"documentId": {"$eq": document_id}})
    except Exception as e:
        print(f"Failed to delete vectors for document {document_id}: {e}")

def query_vectors(embedding: List[float], clerk_user_id: str, document_ids: List[str], top_k: int = 8):
    """Query pinecone vectors"""
    index = get_pinecone_index()
    
    filter_dict = {
        "clerkUserId": {"$eq": clerk_user_id}
    }
    
    if document_ids:
        filter_dict["documentId"] = {"$in": document_ids}
        
    result = index.query(
        vector=embedding,
        filter=filter_dict,
        top_k=top_k,
        include_metadata=True
    )
    
    return result
