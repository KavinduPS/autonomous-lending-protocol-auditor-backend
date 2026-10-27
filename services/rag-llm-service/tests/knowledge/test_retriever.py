from langchain_core.documents import Document

from app.knowledge.retriever import PgVectorRetriever, build_filter, to_score


class FakeStore:
    def __init__(self, results: list) -> None:
        self.results = results
        self.calls: list[dict] = []

    def similarity_search_with_score(self, query: str, k: int, filter: dict | None = None):
        self.calls.append({"query": query, "k": k, "filter": filter})
        return self.results


def hit(source: str, source_id: str, distance: float, **extra: str) -> tuple[Document, float]:
    metadata = {
        "source": source,
        "source_id": source_id,
        "title": f"{source_id} title",
        "vuln_class": "reentrancy",
        **extra,
    }
    return Document(page_content=f"text of {source_id}", metadata=metadata), distance


def test_build_filter() -> None:
    assert build_filter(None, None) is None
    assert build_filter("oracle", None) == {"vuln_class": {"$eq": "oracle"}}
    assert build_filter(None, "scv") == {"source": {"$eq": "scv"}}
    assert build_filter("oracle", "scv") == {
        "$and": [{"vuln_class": {"$eq": "oracle"}}, {"source": {"$eq": "scv"}}]
    }


def test_score_is_one_minus_distance_and_clamped() -> None:
    assert to_score(0.0) == 1.0
    assert to_score(0.25) == 0.75
    assert to_score(1.7) == 0.0
    assert to_score(-0.1) == 1.0


def test_same_entry_appears_once_with_best_piece() -> None:
    store = FakeStore([hit("scv", "A", 0.1), hit(
        "scv", "A", 0.3), hit("scv", "B", 0.4)])
    chunks = PgVectorRetriever(store).retrieve("query", top_k=5)
    assert [chunk.title for chunk in chunks] == ["A title", "B title"]
    assert chunks[0].score == 0.9


def test_one_source_cannot_fill_all_results() -> None:
    results = [hit("code4rena", f"C{i}", 0.1 + i / 100) for i in range(5)]
    results += [hit("scv", "S1", 0.5), hit("defihacklabs", "D1", 0.6)]
    chunks = PgVectorRetriever(
        FakeStore(results), max_per_source=3).retrieve("q", top_k=5)
    sources = [chunk.source for chunk in chunks]
    assert sources.count("code4rena") == 3
    assert "scv" in sources
    assert "defihacklabs" in sources


def test_gap_is_filled_when_only_one_source_matches() -> None:
    results = [hit("code4rena", f"C{i}", 0.1 + i / 100) for i in range(5)]
    chunks = PgVectorRetriever(
        FakeStore(results), max_per_source=3).retrieve("q", top_k=5)
    assert len(chunks) == 5


def test_source_filter_turns_the_cap_off() -> None:
    results = [hit("code4rena", f"C{i}", 0.1 + i / 100) for i in range(5)]
    store = FakeStore(results)
    chunks = PgVectorRetriever(store, max_per_source=3).retrieve(
        "q", top_k=5, source="code4rena")
    assert len(chunks) == 5
    assert store.calls[0]["filter"] == {"source": {"$eq": "code4rena"}}


def test_asks_for_extra_candidates() -> None:
    store = FakeStore([hit("scv", "A", 0.1)])
    PgVectorRetriever(store).retrieve("some code", top_k=5)
    assert store.calls[0]["k"] == 20


def test_blank_query_returns_nothing_and_skips_the_database() -> None:
    store = FakeStore([hit("scv", "A", 0.1)])
    assert PgVectorRetriever(store).retrieve("   ") == []
    assert store.calls == []


def test_incident_name_is_passed_through() -> None:
    store = FakeStore(
        [hit("defihacklabs", "2020_06_bancor", 0.2, incident_name="Bancor")])
    chunk = PgVectorRetriever(store).retrieve("q")[0]
    assert chunk.incident_name == "Bancor"


def test_identical_text_from_different_entries_appears_once() -> None:
    def doc(source_id: str, text: str) -> Document:
        return Document(
            page_content=text,
            metadata={"source": "scv", "source_id": source_id,
                      "title": source_id, "vuln_class": "flash_loan"},
        )

    store = FakeStore([(doc("A", "same text"), 0.2), (doc(
        "B", "same   TEXT"), 0.2), (doc("C", "other"), 0.3)])
    chunks = PgVectorRetriever(store).retrieve("q")
    assert [chunk.title for chunk in chunks] == ["A", "C"]
