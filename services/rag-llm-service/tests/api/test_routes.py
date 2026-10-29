"""Tests for API routes. Never calls the real Claude API or Postgres."""
import pytest
from unittest.mock import patch, MagicMock

class TestHealth:
    def test_health_ok(self, client):
        """Health returns 200 when DB is reachable (in-memory SQLite)."""
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


VALID_PAYLOAD = {
    "audit_id": "test-audit-001",
    "project_ref": "/tmp/fake_project",
}


class TestCreateAnalysis:
    def test_returns_202_queued(self, client):
        """A valid new request returns 202 with status=queued."""
        with patch("app.api.routes._run_analysis"):  
            resp = client.post("/rag/analyses", json=VALID_PAYLOAD)
        assert resp.status_code == 202
        body = resp.json()
        assert body["audit_id"] == "test-audit-001"
        assert body["status"] == "queued"

    def test_duplicate_audit_id_returns_existing(self, client):
        """Submitting the same audit_id twice does not create a second row."""
        with patch("app.api.routes._run_analysis"):
            resp1 = client.post("/rag/analyses", json=VALID_PAYLOAD)
            resp2 = client.post("/rag/analyses", json=VALID_PAYLOAD)
        assert resp1.status_code == 202
        assert resp2.status_code == 202
        assert resp1.json()["audit_id"] == resp2.json()["audit_id"]

    def test_missing_audit_id_returns_422(self, client):
        """Missing required fields return 422 Unprocessable Entity."""
        resp = client.post("/rag/analyses", json={"project_ref": "/tmp/x"})
        assert resp.status_code == 422

    def test_missing_project_ref_returns_422(self, client):
        """Missing project_ref returns 422."""
        resp = client.post("/rag/analyses", json={"audit_id": "x"})
        assert resp.status_code == 422

    def test_empty_body_returns_422(self, client):
        """Empty body returns 422."""
        resp = client.post("/rag/analyses", json={})
        assert resp.status_code == 422


class TestGetAnalysis:
    def test_unknown_audit_id_returns_404(self, client):
        """Unknown audit_id returns 404."""
        resp = client.get("/rag/analyses/does-not-exist")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_get_returns_queued_status(self, client):
        """GET returns current status immediately after POST."""
        with patch("app.api.routes._run_analysis"):
            client.post("/rag/analyses", json=VALID_PAYLOAD)
        resp = client.get(f"/rag/analyses/{VALID_PAYLOAD['audit_id']}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"

    def test_completed_result_has_hypotheses(self, client, db):
        """A completed analysis returns hypotheses in response."""
        from app.db.repository import create_analysis, save_result
        create_analysis(db, "completed-audit", {"audit_id": "completed-audit"})
        save_result(
            db,
            "completed-audit",
            context_data={"contracts": [], "constructor_params": {}},
            hypotheses_data=[{
                "id": "h1",
                "hypothesis_id": "h1",
                "title": "Test vuln",
                "vuln_class": "reentrancy",
                "reason": "test reason",
                "attack_idea": "test attack",
                "severity": "high",
                "confidence": 0.9,
                "location": {"file": "Test.sol", "contract": "Test", "function": "foo", "lines": [1, 10]},
                "preconditions": ["needs flash loan"],
                "similar_incidents": [],
            }],
        )
        resp = client.get("/rag/analyses/completed-audit")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "completed"
        assert len(body["hypotheses"]) == 1
        assert body["hypotheses"][0]["title"] == "Test vuln"

    def test_failed_analysis_returns_error(self, client, db):
        """A failed analysis returns status=failed with error message."""
        from app.db.repository import create_analysis, save_error
        create_analysis(db, "failed-audit", {})
        save_error(db, "failed-audit", "Claude timed out")
        resp = client.get("/rag/analyses/failed-audit")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "failed"
        assert body["error"] == "Claude timed out"
