import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Analysis(Base):
    """Stores one audit analysis request and its result."""

    __tablename__ = "analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    audit_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )  
    input_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    context_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    hypotheses: Mapped[list["Hypothesis"]] = relationship(
        "Hypothesis", back_populates="analysis", cascade="all, delete-orphan"
    )


class Hypothesis(Base):
    """Stores one vulnerability hypothesis linked to an analysis."""

    __tablename__ = "hypotheses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    hypothesis_id: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "h1"
    title: Mapped[str] = mapped_column(Text, nullable=False)
    vuln_class: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    attack_idea: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False)
    location: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    preconditions: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    similar_incidents: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)

    analysis: Mapped["Analysis"] = relationship("Analysis", back_populates="hypotheses")
