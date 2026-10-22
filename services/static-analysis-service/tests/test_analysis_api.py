from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app


CONTRACTS = Path(__file__).parent / "fixtures" / "contracts"


def test_detects_tx_origin():
    source = (CONTRACTS / "TxOriginExample.sol").read_text(
        encoding="utf-8"
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/analysis",
            json={"audit_id": "test-vulnerable", "source_code": source},
        )

    assert response.status_code == 200
    result = response.json()
    assert result["audit_id"] == "test-vulnerable"
    assert result["status"] == "completed"
    assert result["finding_count"] == len(result["findings"])
    assert any(
        finding["rule_id"] == "tx-origin"
        for finding in result["findings"]
    )


def test_corrected_authorization_has_no_tx_origin_finding():
    source = (CONTRACTS / "TxOriginFixed.sol").read_text(
        encoding="utf-8"
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/analysis",
            json={"audit_id": "test-corrected", "source_code": source},
        )

    assert response.status_code == 200
    assert not any(
        finding["rule_id"] == "tx-origin"
        for finding in response.json()["findings"]
    )


def test_invalid_solidity_returns_422():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/analysis",
            json={
                "audit_id": "test-invalid",
                "source_code": (
                    "pragma solidity 0.8.24; "
                    "contract Broken { uint256 public amount }"
                ),
            },
        )

    assert response.status_code == 422
    assert "ParserError" in response.json()["detail"]