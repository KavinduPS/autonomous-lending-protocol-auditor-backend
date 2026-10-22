from typing import Literal

from pydantic import BaseModel, Field


class FindingLocation(BaseModel):
    file: str
    start_line: int | None = None
    end_line: int | None = None


class Finding(BaseModel):
    finding_id: str
    tool_finding_id: str | None = None
    tool: Literal["slither"] = "slither"
    rule_id: str
    description: str
    severity: str
    confidence: str
    reference: str | None = None
    locations: list[FindingLocation] = Field(default_factory=list)
