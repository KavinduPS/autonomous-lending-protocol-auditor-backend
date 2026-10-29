"""Tests for the analyzer. Claude call is always mocked — no API key needed."""
import pytest
from unittest.mock import patch

from app.code_prep.parser import ContractInfo, FunctionInfo
from tests.conftest import FakeRetriever
from app.reasoning.analyzer import analyze_project


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

MOCK_CLAUDE_RESPONSE = [
    {
        "id": "h1",
        "title": "Reentrancy in withdraw",
        "vuln_class": "reentrancy",
        "reason": "No reentrancy guard",
        "attack_idea": "Re-enter before balance update",
        "severity": "high",
        "confidence": 0.85,
        "location": {
            "file": "src/Vault.sol",
            "contract": "Vault",
            "function": "withdraw",
            "lines": [5, 5],
        },
        "preconditions": ["needs flash loan"],
        "similar_incidents": [{"source": "defihacklabs", "name": "Cream Finance"}],
    }
]


class TestAnalyzeProject:
    def test_returns_hypotheses_with_fake_claude(self):
        """Analyzer returns hypotheses when _call_claude is mocked."""
        with patch("app.reasoning.analyzer._call_claude", return_value=MOCK_CLAUDE_RESPONSE):
            result = analyze_project("test-001", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        assert len(result) >= 1
        assert result[0]["title"] == "Reentrancy in withdraw"

    def test_claude_failure_returns_empty(self):
        """If Claude raises, analyzer returns empty list instead of crashing."""
        with patch("app.reasoning.analyzer._call_claude", side_effect=Exception("timeout")):
            result = analyze_project("test-002", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        assert result == []

    def test_empty_project_returns_empty(self):
        """Empty sol_files returns empty list."""
        with patch("app.reasoning.analyzer._call_claude", return_value=[]):
            result = analyze_project("test-003", [], [], FakeRetriever())
        assert result == []

    def test_hypotheses_sorted_by_confidence_descending(self):
        """Analyzer sorts results by confidence high to low."""
        multi_response = [
            {**MOCK_CLAUDE_RESPONSE[0], "id": "h1", "confidence": 0.4},
            {**MOCK_CLAUDE_RESPONSE[0], "id": "h2", "confidence": 0.9},
        ]
        with patch("app.reasoning.analyzer._call_claude", return_value=multi_response):
            result = analyze_project("test-004", FAKE_SOL, FAKE_CONTRACTS, FakeRetriever())
        confidences = [h["confidence"] for h in result]
        assert confidences == sorted(confidences, reverse=True)
