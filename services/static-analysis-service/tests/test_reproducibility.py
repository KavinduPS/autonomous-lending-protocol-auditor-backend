import hashlib
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_repeated_scan_has_stable_findings_and_source_metadata():
    source = (
        Path(__file__).parent / "fixtures/contracts/TxOriginExample.sol"
    ).read_text(encoding="utf-8")

    with TestClient(app) as client:
        responses = [
            client.post("/api/v1/analysis", json={
                "audit_id": audit_id,
                "source_code": source,
            })
            for audit_id in ("repeat-001", "repeat-002")
        ]

    assert all(response.status_code == 200 for response in responses)
    first, second = [response.json() for response in responses]
    assert first["audit_id"] != second["audit_id"]
    assert first["findings"]
    assert {item["finding_id"] for item in first["findings"]} == {
        item["finding_id"] for item in second["findings"]
    }
    assert first["metadata"] == second["metadata"]
    assert first["metadata"]["source_sha256"] == hashlib.sha256(
        source.encode("utf-8")
    ).hexdigest()
    assert first["metadata"]["slither_version"]
    assert first["metadata"]["compiler_version"].startswith("0.8.24+")

    for result in (first, second):
        for finding in result["findings"]:
            assert finding["tool_finding_id"]
            assert "workspaces/" not in finding["description"]
            assert "workspaces\\" not in finding["description"]
            assert finding["locations"]
            assert all(
                location["file"] == "Contract.sol"
                for location in finding["locations"]
            )
