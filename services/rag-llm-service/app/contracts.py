from typing import Literal, Protocol
from pydantic import BaseModel

VULN_CLASSES = [
    "reentrancy",
    "access_control",
    "price_manipulation",
    "oracle",
    "flash_loan",
    "integer_overflow",
    "logic_error",
    "other",
]


class RetrievedChunk(BaseModel):
    text: str
    source: Literal["scv", "code4rena", "defihacklabs"]
    title: str
    vuln_class: str
    incident_name: str | None = None
    score: float


class Retriever(Protocol):
    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        vuln_class: str | None = None,
        source: str | None = None,
    ) -> list[RetrievedChunk]: ...
