from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(
    title="RAG LLM Service",
    description="Knowledge-augmented vulnerability hypothesis generator for DeFi lending protocols",
    version="1.0.0",
)

app.include_router(router)
app.include_router(router, prefix="/api/analysis")
