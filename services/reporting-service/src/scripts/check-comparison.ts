import assert from "node:assert/strict";
import { buildComparison } from "../services/comparison.builder.js";
import type {
  ReportAttempt,
  ReportAudit,
  ReportDetection,
  ReportFinding,
} from "../services/report.builder.js";

const det = (
  o: Partial<ReportDetection> & Pick<ReportDetection, "source">,
): ReportDetection => ({
  sourceRef: null,
  ruleId: null,
  severity: "MEDIUM",
  confidence: "HIGH",
  description: "d",
  file: "Contract.sol",
  lineStart: 1,
  lineEnd: 5,
  raw: {},
  ...o,
});
const evidence = (
  status: string,
  profit: number,
  gas: number,
  revert: string | null = null,
) => ({
  status,
  revert_reason: revert,
  profit_native: profit,
  gas_used: gas,
  duration_ms: 500,
});
const attempt = (
  attemptNo: number,
  outcome: ReportAttempt["outcome"],
  ev: unknown,
): ReportAttempt => ({
  id: `att-${attemptNo}-${outcome}`,
  attemptNo,
  outcome,
  evidence: ev,
});
const finding = (
  o: Partial<ReportFinding> & Pick<ReportFinding, "id" | "title">,
): ReportFinding => ({
  severity: "LOW",
  verificationStatus: "UNVERIFIED",
  triageDecision: null,
  triageScore: null,
  triageReason: null,
  file: "Contract.sol",
  lineStart: 1,
  lineEnd: 5,
  contractName: null,
  functionName: null,
  category: { code: "other", name: "Other", defaultMitigation: "Review." },
  detections: [],
  exploitAttempts: [],
  ...o,
});

const F1 = finding({
  id: "f1",
  title: "Reentrancy",
  severity: "HIGH",
  verificationStatus: "CONFIRMED",
  triageDecision: "SIMULATE",
  triageScore: 0.8,
  triageReason: "high",
  detections: [
    det({ source: "SLITHER", ruleId: "reentrancy-eth", severity: "MEDIUM" }),
    det({ source: "RAG", severity: "HIGH", raw: { confidence: 0.9 } }),
  ],
  exploitAttempts: [attempt(1, "CONFIRMED", evidence("success", 1.5, 150000))],
});
const F2 = finding({
  id: "f2",
  title: "Spot price",
  severity: "MEDIUM",
  lineStart: 20,
  verificationStatus: "NOT_CONFIRMED",
  triageDecision: "SIMULATE",
  detections: [det({ source: "RAG", severity: "MEDIUM" })],
  exploitAttempts: [
    attempt(1, "NOT_CONFIRMED", evidence("revert", 0, 50000, "guard")),
  ],
});
const F5 = finding({
  id: "f5",
  title: "Could not run",
  lineStart: 50,
  triageDecision: "SIMULATE",
  detections: [
    det({ source: "SLITHER", ruleId: "tx-origin", severity: "LOW" }),
  ],
  exploitAttempts: [attempt(1, "ERROR", evidence("failed", 0, 0))],
});
const F4 = finding({
  id: "f4",
  title: "Not tested",
  lineStart: 60,
  detections: [
    det({ source: "SLITHER", ruleId: "missing-zero-check", severity: "LOW" }),
  ],
});
const F3 = finding({
  id: "f3",
  title: "Skipped one",
  severity: "INFO",
  lineStart: 2,
  triageDecision: "SKIP",
  triageReason: "informational",
  detections: [
    det({ source: "SLITHER", ruleId: "solc-version", severity: "INFO" }),
  ],
});

const baseline = {
  chain: "ethereum",
  block_number: 19000000,
  status: "success",
  revert_reason: null,
  profit_native: 0,
  gas_used: 100000,
  duration_ms: 1000,
  execution_trace: "SECRET TRACE",
};
const audit = (o: Partial<ReportAudit> = {}): ReportAudit => ({
  id: "a1",
  contractName: "Bank",
  status: "COMPLETE",
  errorMessage: null,
  sourceUri: "u",
  sourceSha256: null,
  chain: "ethereum",
  blockNumber: 19000000,
  slitherVersion: null,
  compilerVersion: null,
  baseline,
  createdAt: new Date(),
  completedAt: new Date(),
  stages: [
    { stage: "STATIC", status: "COMPLETE" },
    { stage: "RAG", status: "COMPLETE" },
    { stage: "SIMULATION", status: "COMPLETE" },
  ],
  findings: [F4, F3, F1, F5, F2],
  ...o,
});

// ----- complete audit: all three sections -----
const c = buildComparison(audit());
assert.equal(c.audit.id, "a1");

assert.equal(c.normalExecution.available, true);
assert.equal(c.normalExecution.baseline?.profitNative, 0);
assert.equal(c.normalExecution.baseline?.gasUsed, 100000);
assert.equal(
  c.normalExecution.links?.trace,
  "/api/reports/a1/simulations/baseline",
);
assert.ok(
  !JSON.stringify(c).includes("SECRET TRACE"),
  "no traces in the comparison",
);

assert.equal(c.staticVsRag.available, true);
assert.deepEqual(c.staticVsRag.summary, {
  totalFindings: 5,
  staticOnly: 3,
  ragOnly: 1,
  both: 1,
  severityMatches: 0,
  severityMismatches: 1,
});
const [row1, row2] = c.staticVsRag.findings;
assert.equal(row1.findingId, "f1", "highest severity first");
assert.equal(row1.agreement, "BOTH");
assert.equal(row1.severityMatch, false);
assert.equal(row1.finalSeverity, "HIGH");
assert.equal(row1.rag?.confidenceScore, 0.9);
assert.equal(row1.static?.ruleId, "reentrancy-eth");
assert.equal(row2.agreement, "RAG_ONLY");
assert.equal(row2.static, null);
assert.equal(row2.severityMatch, null);

assert.equal(c.exploitSimulation.available, true);
assert.deepEqual(c.exploitSimulation.summary, {
  sentToSimulation: 3,
  confirmed: 1,
  notConfirmed: 1,
  couldNotRun: 1,
  skipped: 1,
  notTested: 1,
});
const sim = c.exploitSimulation.findings;
assert.equal(sim[0].label, "Confirmed");
assert.deepEqual(sim[0].vsBaseline, {
  attemptNo: 1,
  profitNativeDelta: 1.5,
  gasRatio: 1.5,
});
assert.equal(
  sim[0].attempts[0].link,
  "/api/reports/a1/simulations/att-1-CONFIRMED",
);
assert.equal(sim[1].vsBaseline?.profitNativeDelta, 0);
const skipped = sim.find((s) => s.findingId === "f3")!;
assert.equal(skipped.label, "Skipped");
assert.equal(skipped.triage?.reason, "informational");
assert.deepEqual(skipped.attempts, []);
assert.equal(sim.find((s) => s.findingId === "f5")!.vsBaseline, null);

// ----- missing stages -----
const noRag = buildComparison(
  audit({ stages: [{ stage: "STATIC", status: "COMPLETE" }] }),
);
assert.equal(noRag.staticVsRag.available, false);
assert.equal(noRag.staticVsRag.reason, "RAG stage not complete");
assert.deepEqual(noRag.staticVsRag.findings, []);
assert.equal(noRag.staticVsRag.summary, null);

const neither = buildComparison(audit({ stages: [] }));
assert.equal(neither.staticVsRag.reason, "STATIC and RAG stages not complete");

// ----- no baseline -----
const noBase = buildComparison(audit({ baseline: null }));
assert.equal(noBase.normalExecution.available, false);
assert.equal(noBase.normalExecution.baseline, null);
assert.ok(noBase.normalExecution.reason);
assert.equal(noBase.exploitSimulation.findings[0].vsBaseline, null);

// ----- early audit: nothing simulated yet -----
const early = buildComparison(
  audit({
    status: "ANALYZING",
    completedAt: null,
    baseline: null,
    stages: [{ stage: "STATIC", status: "COMPLETE" }],
    findings: [F4],
  }),
);
assert.equal(early.normalExecution.available, false);
assert.equal(early.staticVsRag.available, false);
assert.equal(early.exploitSimulation.available, false);
assert.equal(early.exploitSimulation.reason, "Simulation has not started");

// ----- single finding filter -----
const one = buildComparison(audit(), { findingId: "f1" });
assert.equal(one.staticVsRag.findings.length, 1);
assert.equal(one.staticVsRag.summary?.totalFindings, 1);
assert.equal(one.exploitSimulation.findings.length, 1);
assert.equal(one.exploitSimulation.summary?.confirmed, 1);

console.log("comparison builder: all checks passed");
