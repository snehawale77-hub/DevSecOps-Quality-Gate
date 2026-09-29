"""Flask API and dashboard server for the quality-gate demonstration."""

from __future__ import annotations

import os
from typing import Any

from flask import Flask, jsonify, render_template, request

if __package__:
    from .quality_gate import evaluate_quality_gate
else:
    from quality_gate import evaluate_quality_gate

app = Flask(__name__)


def create_telemetry(scenario: str) -> dict[str, Any]:
    """Return deterministic sample telemetry for the selected demo scenario."""
    telemetry: dict[str, Any] = {
        "build": {"status": "PASS", "duration_seconds": 18.4},
        "tests": {"total": 128, "passed": 128, "failed": 0},
        "quality": {"status": "PASS", "issues": 0, "coverage_percent": 94.2},
        "security": {"status": "PASS", "issues": 0, "high_critical": 0},
        "dependencies": {"status": "PASS", "issues": 0, "audited": 24},
        "scenario": scenario,
    }
    if scenario == "fail":
        telemetry["tests"] = {"total": 128, "passed": 125, "failed": 3}
        telemetry["quality"] = {
            "status": "FAIL",
            "issues": 2,
            "coverage_percent": 87.5,
        }
        telemetry["security"] = {"status": "FAIL", "issues": 2, "high_critical": 1}
        telemetry["dependencies"] = {"status": "FAIL", "issues": 1, "audited": 24}
    return telemetry


def selected_scenario() -> str:
    """Resolve the query-string override or configured default scenario."""
    scenario = request.args.get("scenario", os.getenv("QUALITY_GATE_SCENARIO", "pass"))
    return scenario.strip().lower()


@app.get("/")
def dashboard() -> str:
    return render_template("dashboard.html")


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "healthy", "service": "enterprise-quality-gate"})


@app.get("/api/status")
def status() -> Any:
    scenario = selected_scenario()
    if scenario not in {"pass", "fail"}:
        return jsonify({"error": "scenario must be 'pass' or 'fail'"}), 400
    return jsonify(create_telemetry(scenario))


@app.get("/api/quality-gate")
def quality_gate() -> Any:
    scenario = selected_scenario()
    if scenario not in {"pass", "fail"}:
        return jsonify({"error": "scenario must be 'pass' or 'fail'"}), 400
    return jsonify(evaluate_quality_gate(create_telemetry(scenario)))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)