from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"service": "rag-llm-service", "status": "ok"}