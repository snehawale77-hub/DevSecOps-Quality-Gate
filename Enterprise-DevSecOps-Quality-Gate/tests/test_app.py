"""Endpoint and decision-engine tests for the quality gate."""

from app.app import app, create_telemetry
from app.quality_gate import evaluate_quality_gate


def test_dashboard_renders() -> None:
    response = app.test_client().get("/")

    assert response.status_code == 200
    assert b"Quality Gate" in response.data


def test_health_endpoint_returns_healthy_status() -> None:
    response = app.test_client().get("/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "status": "healthy",
        "service": "enterprise-quality-gate",
    }


def test_status_endpoint_returns_pass_telemetry_by_default() -> None:
    response = app.test_client().get("/api/status")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["tests"] == {"total": 128, "passed": 128, "failed": 0}
    assert payload["security"]["high_critical"] == 0


def test_quality_gate_allows_deployment_for_clean_telemetry() -> None:
    result = evaluate_quality_gate(create_telemetry("pass"))

    assert result["status"] == "PASS"
    assert result["deployment"] == "ALLOWED"
    assert all(result["checks"].values())


def test_quality_gate_blocks_deployment_when_checks_fail() -> None:
    result = evaluate_quality_gate(create_telemetry("fail"))

    assert result["status"] == "FAIL"
    assert result["deployment"] == "BLOCKED"
    assert not all(result["checks"].values())


def test_quality_gate_fails_closed_for_inconsistent_test_counts() -> None:
    telemetry = create_telemetry("pass")
    telemetry["tests"]["failed"] = 1

    result = evaluate_quality_gate(telemetry)

    assert result["checks"]["tests"] is False
    assert result["status"] == "FAIL"
    assert result["deployment"] == "BLOCKED"


def test_quality_gate_blocks_high_or_critical_security_findings() -> None:
    telemetry = create_telemetry("pass")
    telemetry["security"]["high_critical"] = 1

    result = evaluate_quality_gate(telemetry)

    assert result["checks"]["security"] is False
    assert result["status"] == "FAIL"


def test_api_supports_fail_scenario_override() -> None:
    response = app.test_client().get("/api/quality-gate?scenario=fail")

    assert response.status_code == 200
    assert response.get_json()["deployment"] == "BLOCKED"


def test_api_rejects_unknown_scenario() -> None:
    response = app.test_client().get("/api/status?scenario=unknown")

    assert response.status_code == 400
    assert "error" in response.get_json()