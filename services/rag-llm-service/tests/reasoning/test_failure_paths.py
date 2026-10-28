"""Step 8 failure-path tests for the reasoning pipeline.

All Claude calls are mocked — no API key or network needed.
"""
import pytest
from unittest.mock import patch

from app.code_prep.parser import ContractInfo, FunctionInfo
from app.reasoning.fake_retriever import FakeRetriever
from app.reasoning.analyzer import analyze_project
from app.reasoning.validator import validate_hypotheses


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

FAKE_SOL = [{"path": "src/Vault.sol", "content": """
pragma solidity ^0.8.0;
contract Vault {
    function deposit(uint amount) external {}
    function withdraw(uint amount) external {}
}
"""}]

FAKE_CONTRACTS = [
    ContractInfo(
        name="Vault",
        file="src/Vault.sol",
        start_line=3,
        end_line=7,
        functions=[
            FunctionInfo("deposit", 4, 4),
            FunctionInfo("withdraw", 5, 5),
        ],
    )
]


# ---------------------------------------------------------------------------
# Analyzer — failure paths
# ---------------------------------------------------------------------------

class TestAnalyzerFailurePaths:
    def test_claude_timeout_returns_empty_not_crash(self):
        """If Claude raises a timeout exception, analyzer returns [] instead of crashing."""
        with patch("app.reasoning.analyzer._call_claude", side_effect=TimeoutError("Claude timed out")):
            result = analyze_project("fail-001", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        assert result == []

    def test_claude_api_error_returns_empty(self):
        """If Claude raises a generic API error, analyzer handles it gracefully."""
        with patch("app.reasoning.analyzer._call_claude", side_effect=Exception("API rate limit exceeded")):
            result = analyze_project("fail-002", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        assert result == []

    def test_claude_returns_empty_list(self):
        """If Claude returns an empty list, analyzer returns empty without error."""
        with patch("app.reasoning.analyzer._call_claude", return_value=[]):
            result = analyze_project("fail-003", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        assert result == []

    def test_claude_returns_non_list_garbage(self):
        """If Claude returns garbage (not a list), analyzer returns empty without crashing."""
        with patch("app.reasoning.analyzer._call_claude", return_value=None):
            # None is not iterable — analyzer should catch and return []
            result = analyze_project("fail-004", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        assert result == []

    def test_retriever_failure_still_calls_claude(self):
        """If retriever raises, analyzer falls back to empty retrieved list and still calls Claude."""
        class BrokenRetriever:
            def retrieve(self, query, top_k=5, vuln_class=None, source=None):
                raise ConnectionError("pgvector unreachable")

        good_response = [{
            "id": "h1",
            "title": "Reentrancy in withdraw",
            "vuln_class": "reentrancy",
            "reason": "No guard",
            "attack_idea": "Re-enter",
            "severity": "high",
            "confidence": 0.85,
            "location": {"file": "src/Vault.sol", "contract": "Vault", "function": "withdraw", "lines": [5]},
            "preconditions": [],
            "similar_incidents": [],
        }]

        with patch("app.reasoning.analyzer._call_claude", return_value=good_response):
            result = analyze_project("fail-005", FAKE_SOL, FAKE_CONTRACTS, BrokenRetriever())
        # Should still return hypotheses even without retrieved chunks
        assert len(result) >= 1


# ---------------------------------------------------------------------------
# Validator — invalid Claude output
# ---------------------------------------------------------------------------

class TestValidatorInvalidOutput:
    def test_hypothesis_missing_location_key_is_dropped(self):
        """Hypothesis with no location dict at all is dropped cleanly."""
        hyp = {
            "id": "h1",
            "title": "Ghost vuln",
            "vuln_class": "reentrancy",
            "reason": "test",
            "attack_idea": "test",
            "severity": "high",
            "confidence": 0.8,
            # location missing entirely
            "preconditions": [],
            "similar_incidents": [],
        }
        result = validate_hypotheses([hyp], FAKE_CONTRACTS)
        assert result == []

    def test_hypothesis_with_empty_location_is_dropped(self):
        """Hypothesis with empty location dict (no file) is dropped."""
        hyp = {
            "id": "h1",
            "title": "No location",
            "vuln_class": "reentrancy",
            "reason": "test",
            "attack_idea": "test",
            "severity": "high",
            "confidence": 0.8,
            "location": {},
            "preconditions": [],
            "similar_incidents": [],
        }
        result = validate_hypotheses([hyp], FAKE_CONTRACTS)
        assert result == []

    def test_all_invalid_hypotheses_returns_empty(self):
        """All invalid hypotheses → empty list returned."""
        hyps = [
            {"id": "h1", "location": {"file": "FAKE.sol", "contract": "X", "function": "y", "lines": []},
             "title": "T", "vuln_class": "reentrancy", "reason": "r", "attack_idea": "a",
             "severity": "high", "confidence": 0.9, "preconditions": [], "similar_incidents": []},
            {"id": "h2", "location": {"file": "ALSO_FAKE.sol", "contract": "X", "function": "z", "lines": []},
             "title": "T2", "vuln_class": "reentrancy", "reason": "r", "attack_idea": "a",
             "severity": "low", "confidence": 0.3, "preconditions": [], "similar_incidents": []},
        ]
        result = validate_hypotheses(hyps, FAKE_CONTRACTS)
        assert result == []

    def test_mixed_valid_invalid_keeps_only_valid(self):
        """Mix of valid and invalid hypotheses keeps only valid ones."""
        valid_hyp = {
            "id": "h1",
            "title": "Real vuln",
            "vuln_class": "reentrancy",
            "reason": "r",
            "attack_idea": "a",
            "severity": "high",
            "confidence": 0.9,
            "location": {"file": "src/Vault.sol", "contract": "Vault", "function": "withdraw", "lines": [5]},
            "preconditions": [],
            "similar_incidents": [],
        }
        invalid_hyp = {
            "id": "h2",
            "title": "Fake vuln",
            "vuln_class": "reentrancy",
            "reason": "r",
            "attack_idea": "a",
            "severity": "low",
            "confidence": 0.3,
            "location": {"file": "GHOST.sol", "contract": "Ghost", "function": "ghost", "lines": []},
            "preconditions": [],
            "similar_incidents": [],
        }
        result = validate_hypotheses([valid_hyp, invalid_hyp], FAKE_CONTRACTS)
        assert len(result) == 1
        assert result[0]["id"] == "h1"

    def test_non_numeric_confidence_defaults_to_half(self):
        """Garbage confidence string is clamped to 0.5."""
        hyp = {
            "id": "h1",
            "title": "T",
            "vuln_class": "reentrancy",
            "reason": "r",
            "attack_idea": "a",
            "severity": "high",
            "confidence": "very_confident",  # garbage
            "location": {"file": "src/Vault.sol", "contract": "Vault", "function": "withdraw", "lines": [5]},
            "preconditions": [],
            "similar_incidents": [],
        }
        result = validate_hypotheses([hyp], FAKE_CONTRACTS)
        assert len(result) == 1
        assert result[0]["confidence"] == 0.5
