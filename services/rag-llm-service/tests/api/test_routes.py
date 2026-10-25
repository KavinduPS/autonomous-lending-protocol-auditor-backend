from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "rag-llm-service"


def test_create_and_get_analysis_stub():
    payload = {
        "audit_id": "test-uuid-123",
        "project_ref": "/data/projects/test",
    }
    # Test POST stub
    post_res = client.post("/rag/analyses", json=payload)
    assert post_res.status_code == 202
    post_data = post_res.json()
    assert post_data["audit_id"] == "test-uuid-123"
    assert post_data["status"] == "queued"

    # Test GET stub
    get_res = client.get("/rag/analyses/test-uuid-123")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["audit_id"] == "test-uuid-123"
    assert get_data["status"] == "completed"
    assert len(get_data["hypotheses"]) > 0
