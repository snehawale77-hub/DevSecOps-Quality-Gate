# Enterprise DevSecOps Automated Quality Gate Pipeline

## Abstract

This microproject demonstrates a release quality gate for a Python service. A Flask API exposes build, unit-test, code-quality, security, and dependency telemetry. The gate permits deployment only when every required check passes; a single failed check blocks release. A responsive dashboard turns that decision into an operational view suitable for a CI/CD and DevSecOps presentation.

The dashboard uses deterministic demonstration telemetry. In the GitHub Actions workflow, PyTest, Ruff, Bandit, and pip-audit run as independent blocking steps before the report evaluator. These checks return non-zero status when their validation fails or vulnerabilities are found.

## Architecture

```text
Browser dashboard
  ├── GET /api/status        -> sample pipeline telemetry
  └── GET /api/quality-gate  -> quality_gate.evaluate_quality_gate()
                                  ├── Build status
                                  ├── Unit-test counts
                                  ├── Ruff/code-quality findings
                                  ├── Bandit/security findings
                                  └── pip-audit/dependency findings

GitHub Actions: pytest -> Ruff -> Bandit -> pip-audit -> report gate evaluator
```

The evaluator is deliberately fail-closed: missing, inconsistent, or failing telemetry does not authorize deployment. No database or container runtime is required. `reports/sample_report.json` is a reusable passing report for the standalone evaluator.

## Tech Stack

- Python 3.10+ and Flask
- HTML5, CSS3, and vanilla JavaScript
- Chart.js 4 for test-result visualization
- PyTest, Ruff, Bandit, and pip-audit
- GitHub Actions for pull-request and `main` branch checks

## Installation

From the project directory, create and activate a virtual environment, then install the dependencies:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Run the dashboard locally:

```powershell
python app/app.py
```

Open <http://127.0.0.1:5000>. The service binds only to the loopback interface. The dashboard refreshes telemetry every 15 seconds; the scenario selector can also trigger an immediate update.

Run the same checks used by CI:

```powershell
python -m pytest -q
ruff check .
bandit -r app
pip-audit -r requirements.txt
python -m app.quality_gate --report reports/sample_report.json
```

The final command returns exit code `0` for PASS, `1` for a failed gate, and `2` when its report cannot be read. The CI tool steps also fail the workflow directly when tests, lint, SAST, or dependency auditing fails.

## Demonstration Mode

Use the selector in the dashboard to switch between `PASS / all checks clear` and `FAIL / issues detected`. This is the simplest presentation flow and updates both API-backed cards and the chart without restarting the server.

The same scenarios are available through the API:

```text
http://127.0.0.1:5000/api/status?scenario=pass
http://127.0.0.1:5000/api/quality-gate?scenario=pass
http://127.0.0.1:5000/api/status?scenario=fail
http://127.0.0.1:5000/api/quality-gate?scenario=fail
```

For a terminal-only presentation, set the default scenario before starting Flask. Restart after changing the value:

```powershell
$env:QUALITY_GATE_SCENARIO = "pass"
python app/app.py
```

To demonstrate a blocked deployment, stop the server, set `QUALITY_GATE_SCENARIO` to `fail`, and start it again. The fail scenario includes three failed tests, code-quality findings, a high/critical security finding, and a vulnerable dependency. A request-level `?scenario=pass` or `?scenario=fail` takes precedence over the environment default.

## API

- `GET /` renders the dashboard.
- `GET /health` returns service health as JSON.
- `GET /api/status` returns telemetry; optional `scenario=pass|fail` selects the demonstration fixture.
- `GET /api/quality-gate` evaluates the selected fixture and returns `status`, `deployment`, individual check results, and a decision message.

## CI/CD Behavior

The workflow runs on pushes and pull requests targeting `main`. It installs the declared tools, executes tests, runs Ruff, scans application code with Bandit at all severity levels, audits declared project requirements with pip-audit, then evaluates the sample telemetry report. Any command reporting test failures, lint findings, Bandit findings, or vulnerable dependencies stops the workflow with a non-zero exit code. The final report evaluation also blocks if its telemetry says deployment is not allowed.