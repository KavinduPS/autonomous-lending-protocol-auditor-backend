import pytest

from app.knowledge.retriever import get_retriever


@pytest.fixture(scope="module")
def retriever():
    try:
        instance = get_retriever()
        instance.retrieve("connection check", top_k=1)
    except Exception as error:  # database not running or not filled
        pytest.skip(f"knowledge base not available: {error}")
    return instance


def test_access_control_query_finds_access_control(retriever) -> None:
    query = "anyone can call a public function to change the owner of the contract"
    results = retriever.retrieve(query, top_k=5)
    assert any(chunk.vuln_class == "access_control" for chunk in results)


def test_source_filter_returns_only_that_source(retriever) -> None:
    results = retriever.retrieve(
        "reentrancy in withdraw", top_k=5, source="defihacklabs")
    assert results
    assert all(chunk.source == "defihacklabs" for chunk in results)


def test_vuln_class_filter_returns_only_that_class(retriever) -> None:
    results = retriever.retrieve(
        "flash loan price manipulation", top_k=5, vuln_class="flash_loan")
    assert results
    assert all(chunk.vuln_class == "flash_loan" for chunk in results)


def test_scores_are_between_zero_and_one_and_sorted(retriever) -> None:
    results = retriever.retrieve(
        "reentrancy withdraw external call before balance update", top_k=5)
    scores = [chunk.score for chunk in results]
    assert scores == sorted(scores, reverse=True)
    assert all(0.0 <= score <= 1.0 for score in scores)
