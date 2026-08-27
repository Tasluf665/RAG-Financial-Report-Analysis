from ..schemas import QueryRequest, QueryResponse, SourceCitation, RetrievalStats
from .embeddings import create_embedding
from .vector_store import query_vectors
from .generation import generate_answer

def process_query(request: QueryRequest) -> QueryResponse:
    # 1. Embed question
    question_embedding = create_embedding(request.question)
    
    # 2. Query pinecone
    results = query_vectors(
        embedding=question_embedding,
        clerk_user_id=request.clerkUserId,
        document_ids=request.documentIds,
        top_k=request.topK
    )
    
    # 3. Process matches
    context_chunks = []
    sources = []
    
    for idx, match in enumerate(results.matches):
        if match.score < 0.5: # arbitrary low score cutoff
            continue
            
        metadata = match.metadata
        context_chunks.append(metadata)
        
        sources.append(SourceCitation(
            citationNumber=idx + 1,
            documentId=metadata.get("documentId"),
            chunkId=metadata.get("chunkId"),
            pageNumber=int(metadata.get("pageNumber", 1)),
            type=metadata.get("type", "text"),
            excerpt=metadata.get("text", "")[:500],
            retrievalSummary=None,
            score=match.score
        ))
        
    # 4. Generate answer
    if not context_chunks:
        answer = "I could not find any relevant information in the selected documents to answer your question."
    else:
        answer = generate_answer(request.question, context_chunks, request.answerStyle)
        
    return QueryResponse(
        answer=answer,
        sources=sources,
        retrieval=RetrievalStats(
            retrievedCount=len(results.matches),
            usedCount=len(context_chunks),
            model="openrouter"
        )
    )
