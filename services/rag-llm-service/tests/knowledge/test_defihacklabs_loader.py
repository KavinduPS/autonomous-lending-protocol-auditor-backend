from app.knowledge.loaders import LoadStats, parse_defihacklabs_rows


def make_row(**overrides: object) -> dict:
    row = {
        "id": "2020_06_bancor",
        "title": "Bancor",
        "ai_vulnerability_type": "Access Control",
        "ai_root_cause": "A transfer function was public.",
        "ai_explanation": "Anyone could move approved tokens.",
        "ai_attack_steps_text": "Find victim || Call the function",
    }
    row.update(overrides)
    return row


def test_valid_row_becomes_chunk() -> None:
    stats = LoadStats()
    chunks = list(parse_defihacklabs_rows([make_row()], stats))
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.source == "defihacklabs"
    assert chunk.source_id == "2020_06_bancor"
    assert chunk.incident_name == "Bancor"
    assert chunk.title == "Bancor (2020-06)"
    assert chunk.vuln_class == "access_control"
    assert "1. Find victim" in chunk.text
    assert "2. Call the function" in chunk.text


def test_row_without_analysis_is_skipped() -> None:
    stats = LoadStats()
    rows = [make_row(ai_root_cause=None, ai_explanation="")]
    assert list(parse_defihacklabs_rows(rows, stats)) == []
    assert stats.skipped_no_analysis == 1


def test_duplicate_ids_are_skipped() -> None:
    stats = LoadStats()
    chunks = list(parse_defihacklabs_rows([make_row(), make_row()], stats))
    assert len(chunks) == 1
    assert stats.skipped_duplicate == 1


def test_unknown_type_becomes_other() -> None:
    stats = LoadStats()
    rows = [make_row(ai_vulnerability_type="Weird thing")]
    assert list(parse_defihacklabs_rows(rows, stats))[0].vuln_class == "other"
