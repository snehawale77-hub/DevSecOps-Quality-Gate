"""Quality-gate evaluation logic and command-line report evaluator."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def evaluate_quality_gate(telemetry: dict[str, Any]) -> dict[str, Any]:
    """Evaluate build, test, quality, and security telemetry fail-closed."""
    build = telemetry.get("build", {})
    tests = telemetry.get("tests", {})
    quality = telemetry.get("quality", {})
    security = telemetry.get("security", {})
    dependencies = telemetry.get("dependencies", {})

    total = tests.get("total", 0)
    passed = tests.get("passed", 0)
    failed = tests.get("failed", 0)
    checks = {
        "build": build.get("status") == "PASS",
        "tests": (
            isinstance(total, int)
            and isinstance(passed, int)
            and isinstance(failed, int)
            and total > 0
            and passed == total
            and failed == 0
        ),
        "code_quality": (
            quality.get("status") == "PASS"
            and quality.get("issues", 0) == 0
        ),
        "security": (
            security.get("status") == "PASS"
            and security.get("issues", 0) == 0
            and security.get("high_critical", 0) == 0
        ),
        "dependencies": (
            dependencies.get("status") == "PASS"
            and dependencies.get("issues", 0) == 0
        ),
    }
    is_pass = all(checks.values())

    return {
        "status": "PASS" if is_pass else "FAIL",
        "deployment": "ALLOWED" if is_pass else "BLOCKED",
        "checks": checks,
        "message": (
            "All quality checks passed. Deployment is allowed."
            if is_pass
            else "One or more quality checks failed. Deployment is blocked."
        ),
    }


def main() -> int:
    """Evaluate a JSON telemetry report and return a CI-friendly exit code."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("reports/sample_report.json"),
        help="Path to a JSON telemetry report (default: reports/sample_report.json)",
    )
    arguments = parser.parse_args()

    try:
        with arguments.report.open(encoding="utf-8") as report_file:
            telemetry = json.load(report_file)
        if not isinstance(telemetry, dict):
            raise TypeError("The report must contain a JSON object.")
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
        print(f"Unable to read quality-gate report: {error}", file=sys.stderr)
        return 2

    result = evaluate_quality_gate(telemetry)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())