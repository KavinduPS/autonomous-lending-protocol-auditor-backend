import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Analysis, Hypothesis

logger = logging.getLogger(__name__)


def create_analysis(db: Session, audit_id: str, input_data: dict | str) -> Analysis:
    """Create a new analysis record in queued state. If audit_id already exists, return existing."""
    existing = get_analysis(db, audit_id)
    if existing:
        logger.info("audit_id=%s already exists (status=%s), returning existing record", audit_id, existing.status)
        return existing

    data = {"project_ref": input_data} if isinstance(input_data, str) else input_data
    analysis = Analysis(audit_id=audit_id, input_data=data, status="queued")
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    logger.info("audit_id=%s created with status=queued", audit_id)
    return analysis


def get_analysis(db: Session, audit_id: str) -> Analysis | None:
    """Load an analysis with all its hypotheses."""
    stmt = select(Analysis).where(Analysis.audit_id == audit_id)
    return db.scalars(stmt).first()


def set_status(db: Session, audit_id: str, status: str) -> None:
    """Update analysis status (e.g. running)."""
    analysis = get_analysis(db, audit_id)
    if analysis:
        analysis.status = status
        db.commit()
        logger.info("audit_id=%s status -> %s", audit_id, status)


def save_error(db: Session, audit_id: str, error_message: str) -> None:
    """Mark an analysis as failed and store the error message."""
    analysis = get_analysis(db, audit_id)
    if analysis:
        analysis.status = "failed"
        analysis.error_message = error_message
        db.commit()
        logger.info("audit_id=%s status=failed: %s", audit_id, error_message)


def save_result(
    db: Session,
    audit_id: str,
    context_data: dict,
    hypotheses_data: list[dict],
) -> Analysis | None:
    """Atomically update status to completed and insert all hypotheses."""
    analysis = get_analysis(db, audit_id)
    if not analysis:
        return None

    analysis.context_data = context_data
    analysis.status = "completed"

    for h in hypotheses_data:
        hyp = Hypothesis(
            analysis_id=analysis.id,
            hypothesis_id=h.get("id", "h1"),
            title=h.get("title", "Potential Vulnerability"),
            vuln_class=h.get("vuln_class", "other"),
            reason=h.get("reason", ""),
            attack_idea=h.get("attack_idea", ""),
            severity=h.get("severity", "medium").lower() if isinstance(h.get("severity"), str) else "medium",
            confidence=float(h.get("confidence", 0.75)),
            location=h.get("location", {}),
            preconditions=h.get("preconditions", []),
            similar_incidents=h.get("similar_incidents", []),
        )
        db.add(hyp)

    db.commit()
    db.refresh(analysis)
    logger.info("audit_id=%s saved %d hypotheses, status=completed", audit_id, len(hypotheses_data))
    return analysis
