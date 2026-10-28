import logging

from fastapi import FastAPI

from app.api.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="RAG LLM Service",
    description="Knowledge-augmented vulnerability hypothesis generator for DeFi lending protocols",
    version="1.0.0",
)

app.include_router(router)
