from fastapi import FastAPI, Depends, HTTPException, Header, BackgroundTasks
from .config import settings
from .schemas import IngestionRequest, IngestionResponse, QueryRequest, QueryResponse
from .services.ingestion import process_document
from .services.query import process_query
from .services.vector_store import delete_document_vectors

app = FastAPI(title="DocuRAG Python Service")

def verify_internal_token(x_internal_service_token: str = Header(None)):
    if x_internal_service_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")

@app.get("/internal/health")
def health_check():
    return {"status": "ok", "service": "rag-python"}

@app.post("/internal/ingest", status_code=202, dependencies=[Depends(verify_internal_token)])
def ingest_document(request: IngestionRequest, background_tasks: BackgroundTasks):
    # Dispatch processing to run asynchronously to prevent Node fetch timeouts
    background_tasks.add_task(process_document, request)
    return {"status": "queued", "documentId": request.documentId}

@app.post("/internal/query", response_model=QueryResponse, dependencies=[Depends(verify_internal_token)])
def query_documents(request: QueryRequest):
    try:
        return process_query(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@app.delete("/internal/documents/{document_id}/vectors", dependencies=[Depends(verify_internal_token)])
def delete_vectors(document_id: str):
    try:
        delete_document_vectors(document_id)
        return {"status": "success", "message": f"Vectors deleted for document {document_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
