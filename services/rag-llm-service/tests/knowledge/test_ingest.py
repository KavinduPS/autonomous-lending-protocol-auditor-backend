from app.knowledge.models import KnowledgeChunk
from scripts.ingest import to_document


def make_chunk(**overrides: object) -> KnowledgeChunk:
    values = {
        "text": "some text",
        "source": "scv",
        "source_id": "SCV-001",
        "title": "SCV-001: Reentrancy",
        "vuln_class": "reentrancy",
    }
    values.update(overrides)
    return KnowledgeChunk(**values)


def test_id_is_stable_and_unique_per_piece() -> None:
    first = to_document(make_chunk())
    again = to_document(make_chunk())
    other_piece = to_document(make_chunk(chunk_index=1))
    assert first.id == again.id
    assert first.id != other_piece.id


def test_none_values_are_not_stored() -> None:
    document = to_document(make_chunk())
    assert "severity" not in document.metadata
    assert "incident_name" not in document.metadata
    assert document.metadata["vuln_class"] == "reentrancy"
