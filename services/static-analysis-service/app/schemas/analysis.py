from typing import Literal
from pydantic import BaseModel, Field, field_validator
from app.core.config import get_settings
from app.schemas.finding import Finding


class AnalysisRequest(BaseModel):
    audit_id: str = Field(min_length=1, max_length=100)
    source_code: str = Field(min_length=1)

    @field_validator("source_code")
    @classmethod
    def validate_source(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Solidity source code cannot be blank.")
        limit = get_settings().max_source_bytes
        if len(value.encode("utf-8")) > limit:
            raise ValueError(f"Solidity source code exceeds the {limit}-byte limit.")
        return value

class AnalysisMetadata(BaseModel):
    source_sha256: str
    slither_version: str
    compiler_version: str


class AnalysisResponse(BaseModel):
    audit_id: str
    status: Literal["completed"] = "completed"
    finding_count: int
    metadata: AnalysisMetadata
    findings: list[Finding]
