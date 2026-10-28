import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.schemas import AnalysisRequest, AnalysisResponse

router = APIRouter(tags=["RAG Analysis"])

SAMPLE_PATH = Path(__file__).resolve().parent.parent.parent / "docs" / "sample_output.json"


def _load_sample() -> dict:
    if SAMPLE_PATH.exists():
        with open(SAMPLE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "audit_id": "sample-uuid",
        "status": "completed",
        "context": {"contracts": [], "constructor_params": {}},
        "hypotheses": [],
    }


@router.get("/health", status_code=status.HTTP_200_OK)
def health():
    return {
        "status": "ok",
        "service": "rag-llm-service",
        "retriever": settings.retriever,
    }


@router.post(
    "/rag/analyses",
    response_model=AnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_analysis_stub(request: AnalysisRequest):
    """Stub endpoint for Step 1 & 2: returns queued or sample response."""
    sample = _load_sample()
    sample["audit_id"] = request.audit_id
    sample["status"] = "queued"
    return sample


@router.get(
    "/rag/analyses/{audit_id}",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
)
def get_analysis_stub(audit_id: str):
    """Stub endpoint for Step 1 & 2: returns the sample completed result."""
    sample = _load_sample()
    sample["audit_id"] = audit_id
    sample["status"] = "completed"
    return sample
