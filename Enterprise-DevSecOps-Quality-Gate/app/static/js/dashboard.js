"use strict";

const scenarioSelector = document.querySelector("#scenario");
const gateBanner = document.querySelector("#gate-banner");
const stageDetails = {
  source: {
    number: "01", title: "Developer commit", tool: "PIPELINE INPUT",
    description: "A developer submits a code change. This starts the automated checks; no deployment decision is made until every required stage finishes.",
    rule: "Creates a traceable change for the pipeline to validate.",
  },
  build: {
    number: "02", title: "Build", tool: "APPLICATION PACKAGING",
    description: "The project is prepared and checked so it can be started or packaged consistently.",
    rule: "The build must complete successfully before later checks can approve release.",
  },
  tests: {
    number: "03", title: "Unit tests", tool: "PYTEST",
    description: "Automated tests exercise small pieces of application behavior and report passed and failed cases.",
    rule: "At least one test must run, and every test must pass.",
  },
  code_quality: {
    number: "04", title: "Code quality", tool: "RUFF LINTING",
    description: "The linter finds common mistakes and inconsistent code patterns before they become harder to fix.",
    rule: "No lint findings are allowed through this quality gate.",
  },
  security: {
    number: "05", title: "Security scan", tool: "BANDIT / STATIC ANALYSIS",
    description: "Static analysis checks Python source for coding patterns that may expose security weaknesses.",
    rule: "Any reported security issue blocks deployment.",
  },
  dependencies: {
    number: "06", title: "Dependency scan", tool: "PIP-AUDIT / PACKAGE AUDIT",
    description: "Third-party libraries are checked against published vulnerability advisories.",
    rule: "Known vulnerable dependencies must be resolved before release.",
  },
  deployment: {
    number: "07", title: "Deployment decision", tool: "QUALITY GATE",
    description: "The gate combines all preceding results into one clear release decision.",
    rule: "Every required check must pass to allow deployment.",
  },
};
let testChart;
let currentGate;
let selectedStage = "source";

function setSignal(name, passed, value, detail) {
  const card = document.querySelector(`[data-card="${name}"]`);
  card.dataset.state = passed ? "pass" : "fail";
  card.querySelector(".status-pill").textContent = passed ? "PASS" : "FAIL";
  card.querySelector(`[data-value="${name}"]`).textContent = value;
  card.querySelector(`[data-detail="${name}"]`).textContent = detail;
}

function updatePipeline(gate) {
  const stageChecks = {
    build: "build",
    tests: "tests",
    code_quality: "code_quality",
    security: "security",
    dependencies: "dependencies",
  };
  for (const [stage, check] of Object.entries(stageChecks)) {
    const node = document.querySelector(`[data-stage="${stage}"]`);
    const passed = gate.checks[check];
    node.dataset.state = passed ? "pass" : "fail";
    node.querySelector(".node-status").textContent = passed ? "PASS" : "FAIL";
  }
  const deployNode = document.querySelector('[data-stage="deployment"]');
  deployNode.dataset.state = gate.status.toLowerCase();
  deployNode.querySelector(".node-status").textContent = gate.deployment;
  showStageDetails(selectedStage, gate);
}

function showStageDetails(stage, gate = currentGate) {
  selectedStage = stage;
  const details = stageDetails[stage];
  document.querySelectorAll(".pipeline-node").forEach((node) => {
    const selected = node.dataset.stage === stage;
    node.querySelector(".step-button").setAttribute("aria-pressed", String(selected));
  });
  document.querySelector("#step-number").textContent = details.number;
  document.querySelector("#step-tool").textContent = details.tool;
  document.querySelector("#step-title").textContent = details.title;
  document.querySelector("#step-description").textContent = details.description;
  document.querySelector("#step-rule").textContent = details.rule;

  const result = document.querySelector("#step-result");
  const resultPanel = document.querySelector(".explainer-result");
  if (stage === "source") {
    result.textContent = "COMMIT";
    resultPanel.dataset.state = "neutral";
    return;
  }
  if (!gate) {
    result.textContent = "WAITING";
    resultPanel.dataset.state = "neutral";
    return;
  }
  const passed = stage === "deployment" ? gate.status === "PASS" : gate.checks[stage];
  result.textContent = stage === "deployment" ? gate.deployment : passed ? "PASS" : "FAIL";
  resultPanel.dataset.state = passed ? "pass" : "fail";
}

function updateChart(tests) {
  const values = [tests.passed, tests.failed];
  document.querySelector("#passed-count").textContent = tests.passed;
  document.querySelector("#failed-count").textContent = tests.failed;
  document.querySelector("#test-summary").textContent = `${tests.passed} / ${tests.total} passed`;
  if (!window.Chart) {
    document.querySelector("#test-summary").textContent += " · chart unavailable";
    return;
  }
  if (testChart) {
    testChart.data.datasets[0].data = values;
    testChart.update();
    return;
  }
  testChart = new window.Chart(document.querySelector("#test-chart"), {
    type: "doughnut",
    data: {
      labels: ["Passed", "Failed"],
      datasets: [{ data: values, backgroundColor: ["#72db9b", "#ff786d"], borderWidth: 0, hoverOffset: 5 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
    },
  });
}

async function refreshDashboard() {
  const scenario = encodeURIComponent(scenarioSelector.value);
  const query = `?scenario=${scenario}`;
  gateBanner.dataset.state = "loading";
  try {
    const [statusResponse, gateResponse] = await Promise.all([
      fetch(`/api/status${query}`, { cache: "no-store" }),
      fetch(`/api/quality-gate${query}`, { cache: "no-store" }),
    ]);
    if (!statusResponse.ok || !gateResponse.ok) throw new Error("Telemetry request failed");
    const [telemetry, gate] = await Promise.all([statusResponse.json(), gateResponse.json()]);
    currentGate = gate;

    setSignal("build", gate.checks.build, telemetry.build.status, `${telemetry.build.duration_seconds}s build time`);
    setSignal("tests", gate.checks.tests, `${telemetry.tests.passed}/${telemetry.tests.total}`, `${telemetry.tests.failed} failed`);
    setSignal("code_quality", gate.checks.code_quality, `${telemetry.quality.issues} issues`, `${telemetry.quality.coverage_percent}% coverage`);
    setSignal("security", gate.checks.security, `${telemetry.security.issues} issues`, `${telemetry.security.high_critical} high / critical`);
    setSignal("dependencies", gate.checks.dependencies, `${telemetry.dependencies.issues} issues`, `${telemetry.dependencies.audited} packages audited`);
    setSignal("overall", gate.status === "PASS", gate.status, gate.deployment === "ALLOWED" ? "Deployment allowed" : "Deployment blocked");

    gateBanner.dataset.state = gate.status.toLowerCase();
    document.querySelector(".gate-symbol").textContent = gate.status === "PASS" ? "✓" : "!";
    document.querySelector("#gate-status").textContent = gate.status === "PASS" ? "Deployment allowed" : "Deployment blocked";
    document.querySelector("#gate-message").textContent = gate.message;
    document.querySelector("#deployment-status").textContent = gate.deployment;
    document.querySelector("#run-id").textContent = `LOCAL-${Date.now().toString().slice(-6)}`;
    document.querySelector("#last-updated").textContent = `UPDATED ${new Date().toLocaleTimeString()}`;
    updatePipeline(gate);
    updateChart(telemetry.tests);
  } catch (error) {
    gateBanner.dataset.state = "fail";
    document.querySelector("#gate-status").textContent = "Telemetry unavailable";
    document.querySelector("#gate-message").textContent = error.message;
    document.querySelector("#deployment-status").textContent = "BLOCKED";
  }
}

scenarioSelector.addEventListener("change", refreshDashboard);
document.querySelector("#refresh").addEventListener("click", refreshDashboard);
document.querySelector(".pipeline-flow").addEventListener("click", (event) => {
  const button = event.target.closest(".step-button");
  if (button) showStageDetails(button.closest(".pipeline-node").dataset.stage);
});
refreshDashboard();
window.setInterval(refreshDashboard, 15000);