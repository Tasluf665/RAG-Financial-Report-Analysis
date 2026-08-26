from fastapi import FastAPI

app = FastAPI(title="DocuRAG Internal RAG Service")

@app.get("/internal/health")
def health_check():
    return {"status": "ok", "service": "rag-python"}
