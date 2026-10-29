"""Tests for hypothesis validator. No DB, no Claude needed."""
from app.code_prep.parser import ContractInfo, FunctionInfo
from app.reasoning.validator import validate_hypotheses

def _make_contracts():
    return [
        ContractInfo(
            name="LendingPool",
            file="src/LendingPool.sol",
            start_line=1,
            end_line=200,
            functions=[
                FunctionInfo(name="borrow", start_line=10, end_line=50),
                FunctionInfo(name="repay", start_line=55, end_line=90),
            ],
        )
    ]


def _hyp(**kwargs):
    base = {
        "id": "h1",
        "title": "Test",
        "vuln_class": "reentrancy",
        "reason": "test",
        "attack_idea": "test",
        "severity": "high",
        "confidence": 0.8,
        "location": {
            "file": "src/LendingPool.sol",
            "contract": "LendingPool",
            "function": "borrow",
            "lines": [10, 30],
        },
        "preconditions": [],
        "similar_incidents": [],
    }
    base.update(kwargs)
    return base

class TestLocationValidation:
    def test_valid_hypothesis_passes(self):
        hyps = [_hyp()]
        result = validate_hypotheses(hyps, _make_contracts())
        assert len(result) == 1

    def test_fake_file_is_dropped(self):
        hyp = _hyp(location={
            "file": "src/DOESNOTEXIST.sol",
            "contract": "X",
            "function": "borrow",
            "lines": [],
        })
        result = validate_hypotheses([hyp], _make_contracts())
        assert result == []

    def test_fake_function_is_dropped(self):
        hyp = _hyp(location={
            "file": "src/LendingPool.sol",
            "contract": "LendingPool",
            "function": "hallucinated_function",
            "lines": [],
        })
        result = validate_hypotheses([hyp], _make_contracts())
        assert result == []

    def test_empty_function_name_is_kept(self):
        """If Claude omits function name we keep the hypothesis (file-level)."""
        hyp = _hyp(location={
            "file": "src/LendingPool.sol",
            "contract": "LendingPool",
            "function": "",
            "lines": [],
        })
        result = validate_hypotheses([hyp], _make_contracts())
        assert len(result) == 1


class TestVulnClass:
    def test_valid_vuln_class_kept(self):
        hyp = _hyp(vuln_class="reentrancy")
        result = validate_hypotheses([hyp], _make_contracts())
        assert result[0]["vuln_class"] == "reentrancy"

    def test_unknown_vuln_class_becomes_other(self):
        hyp = _hyp(vuln_class="made_up_category")
        result = validate_hypotheses([hyp], _make_contracts())
        assert result[0]["vuln_class"] == "other"


class TestConfidence:
    def test_confidence_above_1_clamped(self):
        hyp = _hyp(confidence=1.5)
        result = validate_hypotheses([hyp], _make_contracts())
        assert result[0]["confidence"] == 1.0

    def test_confidence_below_0_clamped(self):
        hyp = _hyp(confidence=-0.3)
        result = validate_hypotheses([hyp], _make_contracts())
        assert result[0]["confidence"] == 0.0

    def test_invalid_confidence_defaults_to_half(self):
        hyp = _hyp(confidence="not_a_number")
        result = validate_hypotheses([hyp], _make_contracts())
        assert result[0]["confidence"] == 0.5
