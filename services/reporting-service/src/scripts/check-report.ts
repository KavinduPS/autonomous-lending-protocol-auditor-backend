import assert from "node:assert/strict";
import {
  PROFIT_NOTE,
  buildFullReport,
  computeVsBaseline,
  parseBaseline,
  parseRun,
  pickBestAttempt,
  simulationLabel,
  type ReportAttempt,
  type ReportAudit,
  type ReportDetection,
  type ReportFinding,
} from "../services/report.builder.js";

// ----- pure helpers -----
const label = (
  verificationStatus: string,
  triageDecision: string | null,
  outcomes: string[],
) =>
  simulationLabel({
    verificationStatus,
    triageDecision,
    exploitAttempts: outcomes.map((outcome) => ({ outcome })),
  });
assert.equal(label("CONFIRMED", null, ["CONFIRMED"]), "Confirmed");
assert.equal(label("NOT_CONFIRMED", null, ["NOT_CONFIRMED"]), "Not confirmed");
assert.equal(
  label("UNVERIFIED", "SIMULATE", ["ERROR", "ERROR"]),
  "Could not run",
);
assert.equal(label("UNVERIFIED", "SKIP", []), "Skipped");
assert.equal(label("UNVERIFIED", "SIMULATE", []), "Not tested");
assert.equal(label("UNVERIFIED", null, []), "Not tested");

const at = (attemptNo: number, outcome: string) => ({ attemptNo, outcome });
assert.equal(
  pickBestAttempt([at(1, "CONFIRMED"), at(2, "NOT_CONFIRMED")])?.attemptNo,
  1,
);
assert.equal(
  pickBestAttempt([at(1, "CONFIRMED"), at(2, "CONFIRMED")])?.attemptNo,
  2,
);
assert.equal(
  pickBestAttempt([at(1, "NOT_CONFIRMED"), at(2, "ERROR")])?.attemptNo,
  1,
);
assert.equal(pickBestAttempt([at(1, "ERROR")]), null);
assert.equal(pickBestAttempt([]), null);

const run = (profitNative: number | null, gasUsed: number | null) => ({
  status: "success",
  revertReason: null,
  profitNative,
  gasUsed,
  durationMs: 1,
});
assert.equal(computeVsBaseline(null, { attemptNo: 1, run: run(1, 1) }), null);
assert.equal(computeVsBaseline(run(0, 100), null), null);
assert.deepEqual(
  computeVsBaseline(run(0, 100), { attemptNo: 2, run: run(1.5, 150) }),
  {
    attemptNo: 2,
    profitNativeDelta: 1.5,
    gasRatio: 1.5,
  },
);
assert.equal(
  computeVsBaseline(run(0, 0), { attemptNo: 1, run: run(1, 50) })?.gasRatio,
  null,
  "baseline gas 0",
);
assert.equal(
  computeVsBaseline(run(null, 100), { attemptNo: 1, run: run(1, 50) })
    ?.profitNativeDelta,
  null,
);
assert.equal(
  computeVsBaseline(run(0.1, 100), { attemptNo: 1, run: run(0.3, 50) })
    ?.profitNativeDelta,
  0.2,
  "no float noise",
);

assert.equal(parseBaseline(null), null);
assert.equal(
  parseBaseline({ totalDeposits: "100 ETH" })?.profitNative,
  null,
  "old-style baseline does not crash",
);
assert.deepEqual(parseRun("garbage"), {
  status: null,
  revertReason: null,
  profitNative: null,
  gasUsed: null,
  durationMs: null,
});

// ----- fixtures -----
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
  category: {
    code: "other",
    name: "Other",
    defaultMitigation: "Review manually.",
  },
  detections: [],
  exploitAttempts: [],
  ...o,
});

const F1 = finding({
  id: "f1",
  title: "Reentrancy in withdraw",
  severity: "HIGH",
  verificationStatus: "CONFIRMED",
  triageDecision: "SIMULATE",
  triageScore: "0.8",
  triageReason: "high severity",
  contractName: "Bank",
  functionName: "withdraw",
  category: {
    code: "reentrancy",
    name: "Reentrancy",
    defaultMitigation: "Use a reentrancy guard.",
  },
  detections: [
    det({ source: "SLITHER", ruleId: "reentrancy-eth", severity: "MEDIUM" }),
    det({ source: "RAG", severity: "HIGH", raw: { confidence: 0.9 } }),
  ],
  exploitAttempts: [attempt(1, "CONFIRMED", evidence("success", 1.5, 150000))],
});
const F2 = finding({
  id: "f2",
  title: "Spot price oracle",
  severity: "MEDIUM",
  lineStart: 20,
  verificationStatus: "NOT_CONFIRMED",
  triageDecision: "SIMULATE",
  detections: [
    det({ source: "RAG", severity: "MEDIUM", raw: { confidence: 0.6 } }),
  ],
  exploitAttempts: [
    attempt(
      1,
      "NOT_CONFIRMED",
      evidence("revert", 0, 50000, "Reentrancy guard"),
    ),
  ],
});
const F5 = finding({
  id: "f5",
  title: "Compile problem",
  severity: "LOW",
  lineStart: 50,
  triageDecision: "SIMULATE",
  detections: [
    det({ source: "SLITHER", ruleId: "tx-origin", severity: "LOW" }),
  ],
  exploitAttempts: [attempt(1, "ERROR", evidence("failed", 0, 0))],
});
const F4 = finding({
  id: "f4",
  title: "Missing zero check",
  severity: "LOW",
  lineStart: 60,
  detections: [
    det({ source: "SLITHER", ruleId: "missing-zero-check", severity: "LOW" }),
  ],
});
const F3 = finding({
  id: "f3",
  title: "Incorrect Solidity version",
  severity: "INFO",
  lineStart: 2,
  triageDecision: "SKIP",
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
  sourceUri: "uploads/Bank.sol",
  sourceSha256: "abc",
  chain: "ethereum",
  blockNumber: 19000000,
  slitherVersion: "0.11.6",
  compilerVersion: "0.8.24",
  baseline,
  createdAt: new Date("2026-10-29T08:00:00Z"),
  completedAt: new Date("2026-10-29T08:05:00Z"),
  stages: [
    { stage: "SIMULATION", status: "COMPLETE" },
    { stage: "RAG", status: "COMPLETE" },
    { stage: "STATIC", status: "COMPLETE" },
  ],
  findings: [F4, F3, F1, F5, F2], // deliberately unsorted
  ...o,
});

// ----- complete audit -----
const full = buildFullReport(audit());
assert.ok("summary" in full && "findings" in full);
if (!("summary" in full)) throw new Error("expected a full report");

assert.deepEqual(
  full.stages.map((s) => s.stage),
  ["STATIC", "RAG", "SIMULATION"],
  "stages in pipeline order",
);
assert.deepEqual(
  full.findings.map((f) => f.id),
  ["f1", "f2", "f5", "f4", "f3"],
  "severity, then line",
);
assert.deepEqual(full.summary.bySeverity, {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 1,
  LOW: 2,
  INFO: 1,
});
assert.equal(full.summary.totalFindings, 5);
assert.equal(full.summary.flaggedByStatic, 4);
assert.equal(full.summary.flaggedByRag, 2);
assert.equal(full.summary.flaggedByBoth, 1);
assert.equal(full.summary.sentToSimulation, 3);
assert.equal(full.summary.confirmed, 1);

assert.deepEqual(
  full.comparison.map((c) => c.simulation),
  ["Confirmed", "Not confirmed", "Could not run", "Not tested", "Skipped"],
);
assert.deepEqual(
  full.comparison.map((c) => [c.static, c.rag]),
  [
    [true, true],
    [false, true],
    [true, false],
    [true, false],
    [true, false],
  ],
);

const r1 = full.findings[0];
assert.equal(r1.verification, "Confirmed");
assert.equal(r1.recommendation, "Use a reentrancy guard.");
assert.equal(r1.location.contract, "Bank");
assert.equal(r1.location.function, "withdraw");
assert.equal(r1.triage?.score, 0.8);
assert.equal(r1.components.staticAnalysis?.ruleId, "reentrancy-eth");
assert.equal(r1.components.ragLlm?.confidenceScore, 0.9);
assert.deepEqual(r1.components.simulation?.vsBaseline, {
  attemptNo: 1,
  profitNativeDelta: 1.5,
  gasRatio: 1.5,
});
assert.equal(r1.components.simulation?.attempts[0].status, "success");

const r2 = full.findings[1];
assert.equal(
  r2.components.staticAnalysis,
  null,
  "component that did not report is null",
);
assert.deepEqual(r2.components.simulation?.vsBaseline, {
  attemptNo: 1,
  profitNativeDelta: 0,
  gasRatio: 0.5,
});
assert.equal(
  r2.components.simulation?.attempts[0].revertReason,
  "Reentrancy guard",
);

const r5 = full.findings[2];
assert.equal(
  r5.components.simulation?.vsBaseline,
  null,
  "all attempts ERROR gives no comparison",
);
assert.equal(
  full.findings[3].components.simulation,
  null,
  "no attempts gives null simulation",
);
assert.equal(full.findings[3].triage, null);

assert.equal(full.baseline?.profitNative, 0);
assert.equal(full.baseline?.gasUsed, 100000);
assert.equal(full.baseline?.chain, "ethereum");
assert.equal("executionTrace" in (full.baseline ?? {}), false);
assert.ok(
  !JSON.stringify(full).includes("SECRET TRACE"),
  "traces never appear in the report",
);
assert.deepEqual(full.notes, [PROFIT_NOTE]);
assert.equal(full.scope.slitherVersion, "0.11.6");

// ----- no baseline -----
const noBase = buildFullReport(audit({ baseline: null }));
if (!("summary" in noBase)) throw new Error("expected a full report");
assert.equal(noBase.baseline, null);
assert.equal(noBase.findings[0].components.simulation?.vsBaseline, null);

// ----- not complete -----
const partial = buildFullReport(
  audit({ status: "ANALYZING", completedAt: null }),
);
assert.equal(partial.audit.status, "ANALYZING");
assert.deepEqual(partial.findings, []);
assert.equal("summary" in partial, false);
assert.equal(partial.stages.length, 3);

// ----- empty complete audit -----
const empty = buildFullReport(audit({ findings: [], baseline: null }));
if (!("summary" in empty)) throw new Error("expected a full report");
assert.equal(empty.summary.totalFindings, 0);
assert.deepEqual(empty.comparison, []);

console.log("report builder: all checks passed");
