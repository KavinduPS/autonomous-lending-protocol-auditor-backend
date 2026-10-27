from functools import lru_cache
from typing import Any

from app.contracts import RetrievedChunk
from app.knowledge.vector_store import get_store

CANDIDATE_MULTIPLIER = 4


def build_filter(vuln_class: str | None, source: str | None) -> dict[str, Any] | None:
    clauses: list[dict[str, Any]] = []
    if vuln_class:
        clauses.append({"vuln_class": {"$eq": vuln_class}})
    if source:
        clauses.append({"source": {"$eq": source}})
    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def to_score(distance: float) -> float:
    return max(0.0, min(1.0, 1.0 - float(distance)))


def _to_chunk(document: Any, distance: float) -> RetrievedChunk:
    meta = document.metadata
    return RetrievedChunk(
        text=document.page_content,
        source=meta["source"],
        title=meta.get("title", ""),
        vuln_class=meta.get("vuln_class", "other"),
        incident_name=meta.get("incident_name"),
        score=to_score(distance),
    )


class PgVectorRetriever:
    def __init__(self, store: Any, max_per_source: int = 3) -> None:
        self._store = store
        self._max_per_source = max_per_source

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        vuln_class: str | None = None,
        source: str | None = None,
    ) -> list[RetrievedChunk]:
        if not query.strip() or top_k <= 0:
            return []
        results = self._store.similarity_search_with_score(
            query,
            k=top_k * CANDIDATE_MULTIPLIER,
            filter=build_filter(vuln_class, source),
        )
        return self._select(results, top_k, capped=source is None)

    def _select(self, results: list, top_k: int, capped: bool) -> list[RetrievedChunk]:
        seen: set[tuple[str, str | None]] = set()
        seen_text: set[str] = set()
        chosen: list[RetrievedChunk] = []
        skipped: list[RetrievedChunk] = []
        per_source: dict[str, int] = {}
        for document, distance in results:
            chunk = _to_chunk(document, distance)
            entry = (chunk.source, document.metadata.get("source_id"))
            text_key = " ".join(chunk.text.lower().split())
            if entry in seen or text_key in seen_text:
                continue
            seen.add(entry)
            seen_text.add(text_key)
            if capped and per_source.get(chunk.source, 0) >= self._max_per_source:
                skipped.append(chunk)
                continue
            per_source[chunk.source] = per_source.get(chunk.source, 0) + 1
            chosen.append(chunk)
            if len(chosen) == top_k:
                break
        if len(chosen) < top_k:
            chosen.extend(skipped[: top_k - len(chosen)])
        return sorted(chosen, key=lambda chunk: chunk.score, reverse=True)


@lru_cache(maxsize=1)
def get_retriever() -> PgVectorRetriever:
    return PgVectorRetriever(get_store())
