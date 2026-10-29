import assert from "node:assert/strict";
import { prisma } from "../config/db.js";
import {
  completeSchema,
  createAuditSchema,
  ragIngestSchema,
  simulationSchema,
  staticIngestSchema,
  triageSchema,
} from "../schemas/ingest.schemas.js";
import {
  completeAudit,
  computeVerification,
  createAudit,
  IngestError,
  ingestRag,
  ingestSimulation,
  ingestStatic,
  ingestTriage,
  outcomeFromStatus,
} from "../services/ingest.service.js";

const U = "ingest-check";

// ----- pure -----
assert.equal(outcomeFromStatus("success"), "CONFIRMED");
assert.equal(outcomeFromStatus("revert"), "NOT_CONFIRMED");
assert.equal(outcomeFromStatus("failed"), "ERROR");
assert.equal(computeVerification([]), "UNVERIFIED");
assert.equal(computeVerification(["ERROR"]), "UNVERIFIED");
assert.equal(computeVerification(["ERROR", "NOT_CONFIRMED"]), "NOT_CONFIRMED");
assert.equal(computeVerification(["NOT_CONFIRMED", "CONFIRMED"]), "CONFIRMED");

// ----- sample bodies -----
const sf = (
  id: string,
  rule: string,
  sev: string,
  start: number,
  end: number,
) => ({
  finding_id: id,
  rule_id: rule,
  description: "d",
  severity: sev,
  confidence: "High",
  locations: [{ file: "Contract.sol", start_line: start, end_line: end }],
});
const staticBody = (findings: object[]) =>
  staticIngestSchema.parse({
    status: "completed",
    metadata: {
      source_sha256: "abc123",
      slither_version: "0.11.6",
      compiler_version: "0.8.24",
    },
    findings,
  });
const hyp = {
  id: "h1",
  title: "Reentrancy in withdraw",
  location: {
    file: "src/LendingPool.sol",
    contract: "LendingPool",
    function: "withdraw",
    lines: [25, 35],
  },
  vuln_class: "reentrancy",
  reason: "Balance updated after external call.",
  confidence: 0.9,
  severity: "critical",
};
const ragBody = (hypotheses: object[]) =>
  ragIngestSchema.parse({ status: "completed", hypotheses });

const S1 = sf("s1", "reentrancy-eth", "High", 22, 30);
const S2 = sf("s2", "solc-version", "Informational", 2, 2);

const result = {
  status: "success",
  revert_reason: null,
  profit_native: 0,
  gas_used: 21000,
  execution_trace: "[PASS] baseline",
  duration_ms: 1000,
};
const attempt = (extra: object, resultOverride: object = {}) =>
  simulationSchema.parse({
    mode: "exploit_attempt",
    exploit_code: "contract Exploit {}",
    result: { ...result, ...resultOverride },
    ...extra,
  });

const isIngest = (status: number) => (e: unknown) =>
  e instanceof IngestError && e.status === status;

const findingsOf = (auditId: string) =>
  prisma.finding.findMany({
    where: { auditId },
    include: { detections: true },
  });
const findingByRef = (auditId: string, ref: string) =>
  prisma.finding.findFirstOrThrow({
    where: { auditId, detections: { some: { sourceRef: ref } } },
    include: { detections: true, exploitAttempts: true },
  });

async function main() {
  try {
    const A = `ingest-check-a-${Date.now()}`;
    const B = `ingest-check-b-${Date.now()}`;
    const createBody = (id: string) =>
      createAuditSchema.parse({
        audit_id: id,
        user_id: U,
        contract_name: "Check",
        source_uri: "check",
        chain: "ethereum",
        block_number: 19000000,
      });

    // ----- create, duplicate, unknown audit -----
    await createAudit(createBody(A));
    await assert.rejects(createAudit(createBody(A)), isIngest(409));
    await assert.rejects(
      ingestStatic("missing-audit", staticBody([])),
      isIngest(404),
    );

    // ----- static then RAG merge -----
    await ingestStatic(A, staticBody([S1, S2]));
    let audit = await prisma.audit.findUniqueOrThrow({
      where: { id: A },
      include: { stages: true },
    });
    assert.equal(audit.status, "ANALYZING");
    assert.equal(audit.sourceSha256, "abc123");
    assert.equal(
      audit.stages.find((s) => s.stage === "STATIC")?.status,
      "COMPLETE",
    );

    const rag = await ingestRag(A, ragBody([hyp]));
    assert.equal(rag.mergedIntoExisting, 1);
    let fs = await findingsOf(A);
    assert.equal(fs.length, 2);
    const merged = fs.find((f) => f.detections.length === 2)!;
    assert.equal(merged.severity, "CRITICAL");
    assert.deepEqual([...merged.detectedBy].sort(), ["rag", "slither"]);

    // ----- replace semantics -----
    await ingestStatic(A, staticBody([S2]));
    fs = await findingsOf(A);
    assert.equal(fs.length, 2);
    const ragOnly = await findingByRef(A, "h1");
    assert.equal(ragOnly.detections.length, 1);
    assert.deepEqual(ragOnly.detectedBy, ["rag"]);
    assert.equal(ragOnly.severity, "CRITICAL");

    await ingestRag(A, ragBody([]));
    fs = await findingsOf(A);
    assert.equal(fs.length, 1, "finding with no detections is deleted");
    assert.equal(fs[0].detections[0].sourceRef, "s2");

    await ingestStatic(A, staticBody([S1, S2, S2])); // duplicate id in one body
    assert.equal((await findingsOf(A)).length, 2);
    await ingestRag(A, ragBody([hyp]));
    assert.equal((await findingsOf(A)).length, 2);

    // ----- triage -----
    const t = await ingestTriage(
      A,
      triageSchema.parse({
        decisions: [
          { finding_ref: "h1", decision: "SIMULATE", score: 0.8, reason: "ok" },
          { finding_ref: "nope", decision: "SKIP" },
        ],
      }),
    );
    assert.equal(t.updated, 1);
    assert.deepEqual(t.unresolved, ["nope"]);
    const triaged = await findingByRef(A, "h1");
    assert.equal(triaged.triageDecision, "SIMULATE");
    assert.equal(Number(triaged.triageScore), 0.8);

    // ----- simulation -----
    await ingestSimulation(
      A,
      simulationSchema.parse({ mode: "baseline", result }),
    );
    audit = await prisma.audit.findUniqueOrThrow({
      where: { id: A },
      include: { stages: true },
    });
    const base = audit.baseline as Record<string, unknown>;
    assert.equal(base.status, "success");
    assert.equal(base.chain, "ethereum");
    assert.equal(base.block_number, 19000000);
    assert.equal(
      audit.stages.find((s) => s.stage === "SIMULATION")?.status,
      "RUNNING",
    );

    const a1 = await ingestSimulation(
      A,
      attempt({ finding_ref: "h1" }, { profit_native: 1.5 }),
    );
    assert.equal(a1.attemptNo, 1);
    assert.equal(a1.outcome, "CONFIRMED");
    assert.equal(a1.verificationStatus, "CONFIRMED");

    const a2 = await ingestSimulation(
      A,
      attempt(
        { finding_ref: "h1" },
        { status: "revert", revert_reason: "guard" },
      ),
    );
    assert.equal(a2.attemptNo, 2, "next attempt number");
    assert.equal(a2.outcome, "NOT_CONFIRMED");
    assert.equal(
      a2.verificationStatus,
      "CONFIRMED",
      "one confirmed attempt keeps it confirmed",
    );

    const a1b = await ingestSimulation(
      A,
      attempt(
        { finding_ref: "h1", attempt_no: 1 },
        { status: "revert", execution_trace: "[FAIL] replaced" },
      ),
    );
    assert.equal(a1b.verificationStatus, "NOT_CONFIRMED");
    const withAttempts = await findingByRef(A, "h1");
    assert.equal(
      withAttempts.exploitAttempts.length,
      2,
      "same attempt_no replaces",
    );
    assert.equal(
      withAttempts.exploitAttempts.find((x) => x.attemptNo === 1)?.trace,
      "[FAIL] replaced",
    );

    await assert.rejects(
      ingestSimulation(A, attempt({ finding_ref: "ghost" })),
      isIngest(404),
    );

    // ----- complete -----
    await completeAudit(A, completeSchema.parse({ status: "COMPLETE" }));
    audit = await prisma.audit.findUniqueOrThrow({
      where: { id: A },
      include: { stages: true },
    });
    assert.equal(audit.status, "COMPLETE");
    assert.ok(audit.completedAt);
    assert.equal(
      audit.stages.find((s) => s.stage === "SIMULATION")?.status,
      "COMPLETE",
    );

    // ----- failed audit -----
    await createAudit(createBody(B));
    await ingestStatic(B, staticBody([]));
    await ingestSimulation(
      B,
      simulationSchema.parse({ mode: "baseline", result }),
    );
    await completeAudit(
      B,
      completeSchema.parse({
        status: "FAILED",
        error_message: "RAG timed out",
      }),
    );
    const failed = await prisma.audit.findUniqueOrThrow({
      where: { id: B },
      include: { stages: true },
    });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.errorMessage, "RAG timed out");
    assert.equal(
      failed.stages.find((s) => s.stage === "STATIC")?.status,
      "COMPLETE",
    );
    assert.equal(
      failed.stages.find((s) => s.stage === "SIMULATION")?.status,
      "FAILED",
    );

    console.log("ingest: all checks passed");
  } finally {
    await prisma.audit.deleteMany({ where: { userId: U } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
