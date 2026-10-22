import logging

from fastapi import APIRouter, HTTPException

from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.services.analysis_service import analyze_contract


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1",
    tags=["Analysis"],
)


@router.post("/analysis", response_model=AnalysisResponse)
def create_analysis(request: AnalysisRequest) -> AnalysisResponse:
    try:
        return analyze_contract(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Analysis timed out.",
        ) from exc
    except RuntimeError as exc:
        logger.exception("Slither analysis failed")
        raise HTTPException(
            status_code=500,
            detail="Analysis failed. Check the service logs for details.",
        ) from exc
