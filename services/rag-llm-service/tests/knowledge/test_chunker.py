from app.knowledge.chunker import split_chunk
from app.knowledge.models import KnowledgeChunk


def make_chunk(text: str, source: str = "code4rena") -> KnowledgeChunk:
    return KnowledgeChunk(
        text=text,
        source=source,
        source_id="1",
        title="Example",
        vuln_class="reentrancy",
    )


def test_short_text_stays_one_chunk() -> None:
    pieces = split_chunk(make_chunk("short finding"))
    assert len(pieces) == 1
    assert pieces[0].chunk_index == 0


def test_long_text_is_split_and_keeps_metadata() -> None:
    pieces = split_chunk(make_chunk("Paragraph about reentrancy. " * 200))
    assert len(pieces) > 1
    assert all(len(piece.text) <= 1000 for piece in pieces)
    assert [piece.chunk_index for piece in pieces] == list(range(len(pieces)))
    assert all(piece.title == "Example" for piece in pieces)
    assert all(piece.vuln_class == "reentrancy" for piece in pieces)


def test_solidity_code_is_split_by_size() -> None:
    function = "function f(uint256 x) external { balances[msg.sender] += x; }\n"
    code = "contract A {\n" + function * 60 + "}\n"
    pieces = split_chunk(make_chunk(code, source="scv"))
    assert len(pieces) > 1
    assert all(len(piece.text) <= 1200 for piece in pieces)
