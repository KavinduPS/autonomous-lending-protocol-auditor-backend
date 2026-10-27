import json

from app.knowledge.loaders import LoadStats, parse_code4rena_lines


def make_line(**overrides: object) -> str:
    row = {
        "id": "2023-07-lens/m_1",
        "contest": "2023-07-lens",
        "severity": "Medium",
        "tags": None,
        "text": "# Reentrancy in collect\n\nThe function sends tokens before updating state.",
    }
    row.update(overrides)
    return json.dumps(row)


def test_valid_line_becomes_chunk() -> None:
    stats = LoadStats()
    chunks = list(parse_code4rena_lines([make_line()], stats))
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.source == "code4rena"
    assert chunk.source_id == "2023-07-lens/m_1"
    assert chunk.title == "2023-07-lens: Reentrancy in collect"
    assert chunk.vuln_class == "reentrancy"
    assert chunk.severity == "medium"


def test_bad_json_is_skipped_and_counted() -> None:
    stats = LoadStats()
    chunks = list(parse_code4rena_lines(["{oops", make_line()], stats))
    assert len(chunks) == 1
    assert stats.skipped_bad_json == 1


def test_empty_text_is_skipped() -> None:
    stats = LoadStats()
    assert list(parse_code4rena_lines([make_line(text="  ")], stats)) == []
    assert stats.skipped_invalid == 1


def test_duplicate_ids_are_skipped() -> None:
    stats = LoadStats()
    chunks = list(parse_code4rena_lines([make_line(), make_line()], stats))
    assert len(chunks) == 1
    assert stats.skipped_duplicate == 1


def test_link_heading_and_body_links_are_cleaned() -> None:
    heading = (
        "## [[M-01] Identifying publications makes the protocol vulnerable to re-orgs]"
        "(https://github.com/code-423n4/2023-07-lens-findings/issues/148)"
    )
    text = (
        heading
        + "\n*Submitted by [MiloTruck](https://github.com/x)*\n\n"
        + "See [ActionLib.sol#L23](https://github.com/a/b) for details."
    )
    chunk = list(parse_code4rena_lines([make_line(text=text)], LoadStats()))[0]
    assert chunk.title == (
        "2023-07-lens: Identifying publications makes the protocol vulnerable to re-orgs"
    )
    assert "http" not in chunk.text
    assert "Submitted by" not in chunk.text
    assert "ActionLib.sol#L23" in chunk.text


def test_underscore_submitted_by_and_br_tags_are_removed() -> None:
    text = (
        "## [[M-18] Precision is not enough](https://github.com/x/issues/335)\n"
        "_Submitted by Chom_\n\n"
        "[Governor.sol#L465](https://github.com/x/y)<br>\n\nBody text here."
    )
    chunk = list(parse_code4rena_lines([make_line(text=text)], LoadStats()))[0]
    assert chunk.title == "2023-07-lens: Precision is not enough"
    assert "Submitted by" not in chunk.text
    assert "<br>" not in chunk.text
    assert "http" not in chunk.text


def test_bare_urls_are_removed_but_file_references_kept() -> None:
    text = (
        "## [[M-02] Title](https://github.com/x/issues/1)\n"
        "https://github.com/code-423n4/2023-07-lens/blob/main/contracts/Governor.sol#L10-L20\n"
        "Read <https://example.com/docs> and https://example.com/more for context."
    )
    chunk = list(parse_code4rena_lines([make_line(text=text)], LoadStats()))[0]
    assert "http" not in chunk.text
    assert "Governor.sol#L10-L20" in chunk.text
