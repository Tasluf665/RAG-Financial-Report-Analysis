import os
import httpx
from datetime import datetime
from typing import Optional
from .pdf_parser import parse_document
from .chunking import create_chunks, analyze_chunk_content
from .enrichment import create_ai_enhanced_summary
from .embeddings import create_embeddings
from .vector_store import upsert_vectors, delete_document_vectors, MAX_METADATA_TEXT_CHARS
from ..schemas import IngestionRequest, ChunkManifestItem, IngestionResponse
from ..config import settings

def send_status_webhook(document_id: str, status: str, failure: Optional[dict] = None):
    try:
        node_url = f"{settings.NODE_API_BASE_URL}/internal/documents"
        httpx.patch(
            f"{node_url}/{document_id}/status",
            json={"status": status, "failure": failure},
            headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN},
            timeout=float(settings.WEBHOOK_TIMEOUT_SECONDS)
        )
    except Exception as e:
        print(f"Failed to send status webhook for {document_id}: {e}")

def send_complete_webhook(document_id: str, chunks: list, clerk_user_id: str):
    try:
        node_url = f"{settings.NODE_API_BASE_URL}/internal/documents"
        httpx.post(
            f"{node_url}/{document_id}/complete",
            json={
                "chunks": [c.model_dump() for c in chunks],
                "clerkUserId": clerk_user_id
            },
            headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_TOKEN},
            timeout=30.0
        )
    except Exception as e:
        print(f"Failed to send complete webhook for {document_id}: {e}")

def process_document(request: IngestionRequest):
    try:
        file_path = request.filePath
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Document file not found at {file_path}")
            
        send_status_webhook(request.documentId, "processing:parsing")
            
        # 1. Clear old vectors if reprocessing
        delete_document_vectors(request.documentId)
            
        # 2. Extract elements
        elements = parse_document(file_path)
        
        send_status_webhook(request.documentId, "processing:chunking")
        
        # 3. Create raw chunks
        raw_chunks = create_chunks(
            elements, 
            max_chars=request.config.chunkSize,
            new_after=request.config.chunkSize - request.config.chunkOverlap
        )
        
        manifest_chunks = []
        vectors_to_upsert = []
        texts_to_embed = []
        metadata_list = []
        
        # 4. Enrich and prepare embeddings
        for idx, raw_chunk in enumerate(raw_chunks):
            content_data = analyze_chunk_content(raw_chunk)
            chunk_id = f"{request.documentId}:v{request.processingVersion}:{idx+1:03d}"
            
            # Primary type
            primary_type = content_data['types'][0] if content_data['types'] else 'text'
            if 'table' in content_data['types']:
                primary_type = 'table'
            elif 'image' in content_data['types'] and 'table' not in content_data['types']:
                primary_type = 'image'
                
            retrieval_summary = None
            embedding_text = content_data['text']
            
            # Enhance images/tables
            if request.config.summarizeImages and 'image' in content_data['types'] or \
               request.config.summarizeTables and 'table' in content_data['types']:
                retrieval_summary = create_ai_enhanced_summary(
                    content_data['text'],
                    content_data['tables'],
                    content_data['images']
                )
                embedding_text = f"Type: {primary_type}\nPage: {content_data['page_number']}\nSummary: {retrieval_summary}\nContent: {content_data['text']}"

            manifest_chunks.append(ChunkManifestItem(
                chunkId=chunk_id,
                pageNumber=content_data['page_number'],
                type=primary_type,
                content=content_data['text'],
                retrievalSummary=retrieval_summary,
                imageBase64=content_data['images'][0] if content_data['images'] else None,
                tableHtml=content_data['tables'][0] if content_data['tables'] else None
            ))
            
            texts_to_embed.append(embedding_text)
            metadata_list.append({
                "clerkUserId": request.clerkUserId,
                "documentId": request.documentId,
                "chunkId": chunk_id,
                "processingVersion": request.processingVersion,
                "type": primary_type,
                "pageNumber": content_data['page_number'],
                "text": embedding_text[:MAX_METADATA_TEXT_CHARS]
            })

        send_status_webhook(request.documentId, "processing:embedding")

        # 5. Embed and Index
        if texts_to_embed:
            print("🧠 Creating embeddings...")
            embeddings = create_embeddings(texts_to_embed)
            
            for idx, emb in enumerate(embeddings):
                vectors_to_upsert.append({
                    "id": metadata_list[idx]["chunkId"],
                    "values": emb,
                    "metadata": metadata_list[idx]
                })
                
            print(f"📤 Upserting {len(vectors_to_upsert)} vectors to Pinecone...")
            upsert_vectors(vectors_to_upsert)

        send_complete_webhook(request.documentId, manifest_chunks, request.clerkUserId)

    except Exception as e:
        print(f"❌ Ingestion failed: {e}")
        send_status_webhook(request.documentId, "failed", {
            "code": "PROCESSING_ERROR",
            "message": str(e),
            "occurredAt": datetime.utcnow().isoformat()
        })
