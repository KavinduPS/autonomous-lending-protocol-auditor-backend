import json
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repository import (
    create_analysis,
    get_analysis,
    save_error,
    save_result,
    set_status,
)
from app.db.session import get_db
from app.deps import get_retriever
from app.schemas import AnalysisContext, AnalysisRequest, AnalysisResponse, Hypothesis

logger = logging.getLogger(__name__)
router = APIRouter(tags=["RAG Analysis"])

SAMPLE_PATH = (
    Path(__file__).resolve().parent.parent.parent / "docs" / "sample_output.json"
)


def _load_sample() -> dict:
    if SAMPLE_PATH.exists():
        with open(SAMPLE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "audit_id": "sample",
        "status": "completed",
        "context": {"contracts": [], "constructor_params": {}},
        "hypotheses": [],
    }


def _run_analysis(audit_id: str, project_ref: str) -> None:
    """Background task: queued -> running -> completed using the real pipeline.

    Opens its own DB session so it is safe to run in a background thread
    (FastAPI background tasks run in a thread pool — the request-scoped
    session from the endpoint must never be shared across threads).
    """
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        _run_analysis_with_session(audit_id, project_ref, db)


def _run_analysis_with_session(audit_id: str, project_ref: str, db: Session) -> None:
    """Core pipeline logic — receives an already-open session."""
    try:
        set_status(db, audit_id, "running")
        logger.info("audit_id=%s analysis started for %s", audit_id, project_ref)

       
        from app.code_prep.loader import load_sol_files
        from app.code_prep.parser import parse_contracts

        sol_files = load_sol_files(project_ref)
        all_contracts = []
        for sol_file in sol_files:
            contracts = parse_contracts(sol_file["path"], sol_file["content"])
            all_contracts.extend(contracts)

        context_data = {
            "contracts": [
                {
                    "name": c.name,
                    "file": c.file,
                    "is_proxy": c.is_proxy,
                    "implementation": c.implementation,
                }
                for c in all_contracts
            ],
            "constructor_params": {},
        }

        
        from app.reasoning.analyzer import analyze_project
        from app.reasoning.validator import validate_hypotheses

        retriever = get_retriever()
        raw_hypotheses = analyze_project(audit_id, sol_files, all_contracts, retriever)
        validated = validate_hypotheses(raw_hypotheses, all_contracts)

        save_result(db, audit_id, context_data, validated)
        logger.info(
            "audit_id=%s completed with %d validated hypotheses", audit_id, len(validated)
        )

    except Exception as exc:
        logger.exception("audit_id=%s analysis failed", audit_id)
        save_error(db, audit_id, str(exc))


def _analysis_to_response(analysis) -> AnalysisResponse:
    """Convert a DB Analysis ORM object to an AnalysisResponse schema."""
    hypotheses = []
    if analysis.status == "completed":
        for h in analysis.hypotheses:
            hypotheses.append(
                Hypothesis(
                    id=h.hypothesis_id,
                    title=h.title,
                    location=h.location,
                    vuln_class=h.vuln_class,
                    reason=h.reason,
                    preconditions=h.preconditions,
                    attack_idea=h.attack_idea,
                    similar_incidents=h.similar_incidents,
                    confidence=h.confidence,
                    severity=h.severity,
                )
            )

    return AnalysisResponse(
        audit_id=analysis.audit_id,
        status=analysis.status,
        context=AnalysisContext(**(analysis.context_data or {"contracts": [], "constructor_params": {}})),
        hypotheses=hypotheses,
        error=analysis.error_message,
    )


@router.get("/health", status_code=status.HTTP_200_OK)
def health(db: Session = Depends(get_db)):
    """Health check — verifies database connectivity and retriever availability."""
    from sqlalchemy import text


    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")

    try:
        from app.deps import get_retriever
        get_retriever()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Retriever unavailable: {exc}")

    return {
        "status": "ok",
        "service": "rag-llm-service",
        "retriever": "real",
    }


@router.post(
    "/rag/analyses",
    response_model=AnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_analysis_endpoint(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Accept an analysis request. If audit_id already exists, return existing record."""
    analysis = create_analysis(db, request.audit_id, request.model_dump())

    if analysis.status == "queued":
        background_tasks.add_task(_run_analysis, request.audit_id, request.project_ref)

    return _analysis_to_response(analysis)


@router.get(
    "/rag/analyses/{audit_id}",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
)
def get_analysis_endpoint(audit_id: str, db: Session = Depends(get_db)):
    """Get the current status and result of an analysis."""
    analysis = get_analysis(db, audit_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis '{audit_id}' not found.")
    return _analysis_to_response(analysis)
