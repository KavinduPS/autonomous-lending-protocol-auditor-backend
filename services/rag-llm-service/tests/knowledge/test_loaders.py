import json

from app.knowledge.loaders import LoadStats, parse_scv_lines


def make_line(**overrides: object) -> str:
    row = {
        "id": "SCV-001",
        "category": "Reentrancy",
        "code_snippet": "function withdraw() public {}",
        "vulnerable": True,
        "poc": "contract Attack {}",
        "description": "Sends Ether before updating the balance.",
        "severity": "Critical",
    }
    row.update(overrides)
    return json.dumps(row)


def test_valid_row_becomes_chunk() -> None:
    stats = LoadStats()
    chunks = list(parse_scv_lines([make_line()], stats))
    assert len(chunks) == 1
    assert chunks[0].source == "scv"
    assert chunks[0].vuln_class == "reentrancy"
    assert chunks[0].severity == "critical"
    assert chunks[0].title == "SCV-001: Reentrancy"


def test_bad_json_is_skipped_and_counted() -> None:
    stats = LoadStats()
    chunks = list(parse_scv_lines(["{not json", make_line()], stats))
    assert len(chunks) == 1
    assert stats.skipped_bad_json == 1


def test_non_vulnerable_rows_are_skipped() -> None:
    stats = LoadStats()
    chunks = list(parse_scv_lines([make_line(vulnerable=False)], stats))
    assert chunks == []
    assert stats.skipped_not_vulnerable == 1


def test_duplicate_ids_are_skipped() -> None:
    stats = LoadStats()
    chunks = list(parse_scv_lines([make_line(), make_line()], stats))
    assert len(chunks) == 1
    assert stats.skipped_duplicate == 1
