import pytest

from app.contracts import VULN_CLASSES
from app.knowledge.labels import to_vuln_class


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Reentrancy", "reentrancy"),
        ("Integer Overflow", "integer_overflow"),
        ("Access Control", "access_control"),
        ("Price Oracle Manipulation", "oracle"),
        ("Flash Loan Attack", "flash_loan"),
        ("Something unknown", "other"),
    ],
)
def test_to_vuln_class(label: str, expected: str) -> None:
    assert to_vuln_class(label) == expected


def test_result_is_always_a_known_class() -> None:
    assert to_vuln_class("anything at all") in VULN_CLASSES
