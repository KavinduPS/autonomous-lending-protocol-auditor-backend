"""Initial migration: create vector extension, knowledge schema, analyses and hypotheses tables

Revision ID: 001
Revises: 
Create Date: 2026-10-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("CREATE SCHEMA IF NOT EXISTS knowledge")


    op.create_table(
        "analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("audit_id", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("status", sa.String(20), nullable=False, default="queued"),
        sa.Column("input_data", JSONB, nullable=True),
        sa.Column("context_data", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "hypotheses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "analysis_id",
            UUID(as_uuid=True),
            sa.ForeignKey("analyses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("hypothesis_id", sa.String(50), nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("vuln_class", sa.String(50), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("attack_idea", sa.Text, nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("location", JSONB, nullable=False),
        sa.Column("preconditions", JSONB, nullable=False),
        sa.Column("similar_incidents", JSONB, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("hypotheses")
    op.drop_table("analyses")
    op.execute("DROP SCHEMA IF EXISTS knowledge CASCADE")
    op.execute("DROP EXTENSION IF EXISTS vector")
