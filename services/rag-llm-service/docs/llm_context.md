# LLM Context Pack: rag-llm-service (Person B)

**Project:** rag-llm-service, Python 3.11, production quality code.  
**Stack:** FastAPI, SQLAlchemy 2, Alembic, psycopg, langchain-anthropic, langchain-text-splitters, pydantic v2, pytest, ruff.  
**Rules:**
- Simple, readable code with comprehensive type hints and small, focused functions.
- No new external libraries outside the pinned list; no agents or LangGraph.
- Configuration strictly from environment variables via `pydantic-settings`; zero secrets or hardcoded credentials in code.
- Always include `audit_id` in logs for traceability.
- Follow folder ownership strictly.

### Owned Files (Person B):
- `app/main.py`
- `app/api/**`
- `app/db/**`
- `app/code_prep/**`
- `app/reasoning/**`
- `app/schemas.py`
- `app/deps.py`
- `app/config.py`
- `tests/api/**`
- `tests/reasoning/**`
- `requirements/base.txt`
- `requirements.txt`
- `docker-compose.yml`
- `pyproject.toml`
- `.gitignore`
- `Dockerfile`
- `alembic/**`
- `README.md`
- `CODEOWNERS`

*(Do NOT edit `app/knowledge/**`, `scripts/ingest.py`, `eval/**`, `tests/knowledge/**`, `requirements/knowledge.txt`, `env/knowledge.env.example` — owned by Person A).*

---

### Shared Frozen Contract (`app/contracts.py`):
```python
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
```
