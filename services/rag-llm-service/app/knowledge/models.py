from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.contracts import VULN_CLASSES


class KnowledgeChunk(BaseModel):
    text: str = Field(min_length=1)
    source: Literal["scv", "code4rena", "defihacklabs"]
    source_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    vuln_class: str = "other"
    severity: str | None = None
    incident_name: str | None = None

    @field_validator("vuln_class")
    @classmethod
    def vuln_class_must_be_known(cls, value: str) -> str:
        if value not in VULN_CLASSES:
            raise ValueError(f"unknown vuln_class: {value}")
        return value
