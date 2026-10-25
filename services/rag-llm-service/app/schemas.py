from typing import Any, Literal
from pydantic import BaseModel, Field


class ContractMeta(BaseModel):
    name: str
    file: str
    is_proxy: bool = False
    implementation: str | None = None


class AnalysisContext(BaseModel):
    contracts: list[ContractMeta] = Field(default_factory=list)
    constructor_params: dict[str, Any] = Field(default_factory=dict)


class HypothesisLocation(BaseModel):
    file: str
    contract: str
    function: str
    lines: list[int] = Field(default_factory=list)


class SimilarIncident(BaseModel):
    source: str
    name: str


class Hypothesis(BaseModel):
    id: str
    title: str
    location: HypothesisLocation
    vuln_class: str
    reason: str
    preconditions: list[str] = Field(default_factory=list)
    attack_idea: str
    similar_incidents: list[SimilarIncident] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    severity: Literal["low", "medium", "high", "critical"]


class AnalysisRequest(BaseModel):
    audit_id: str
    project_ref: str
    chain: str | None = None
    contract_address: str | None = None
    block_number: int | None = None


class AnalysisResponse(BaseModel):
    audit_id: str
    status: Literal["queued", "running", "completed", "failed"]
    context: AnalysisContext | None = None
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    error: str | None = None
