from fastapi import FastAPI
from app.core.config import get_settings
from app.api.routers.analysis import router as analysis_router
get_settings()  # Reject invalid configuration before serving requests.

app = FastAPI(title="Static Analysis Service")

app.include_router(analysis_router)

@app.get("/health")
def health():
    return {"service": "static-analysis-service", "status": "ok"}
