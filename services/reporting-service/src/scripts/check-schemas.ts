import assert from "node:assert/strict";
import {
  completeSchema,
  createAuditSchema,
  ragIngestSchema,
  simulationSchema,
  staticIngestSchema,
  triageSchema,
} from "../schemas/ingest.schemas.js";

function ok(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  body: unknown,
  label: string,
) {
  assert.equal(schema.safeParse(body).success, true, `should pass: ${label}`);
}
function bad(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  body: unknown,
  label: string,
) {
  assert.equal(schema.safeParse(body).success, false, `should fail: ${label}`);
}

// ----- create audit -----
const createBody = {
  audit_id: "a1",
  user_id: "u1",
  contract_name: "VulnerableBank",
  source_uri: "uploads/VulnerableBank.sol",
  chain: "ethereum",
  block_number: 19000000,
};
ok(createAuditSchema, createBody, "create audit");
ok(
  createAuditSchema,
  { ...createBody, chain: undefined, block_number: undefined },
  "create audit without chain",
);
bad(createAuditSchema, { ...createBody, user_id: "" }, "empty user_id");
bad(createAuditSchema, { audit_id: "a1" }, "create audit missing fields");

// ----- static: your real output -----
const staticBody = {
  audit_id: "config-check-001",
  status: "completed",
  finding_count: 2,
  metadata: {
    source_sha256:
      "f0c6bc9ddb949e4296bdbd2f4d33d046a00f1725ed59166aad5e323373bbd80c",
    slither_version: "0.11.6",
    compiler_version: "0.8.24+commit.e11b9ed9.Linux.g++",
  },
  findings: [
    {
      finding_id:
        "63f1b2dd14521f6662a5eb60aedd926a5eab73186688bde6c9e4102cef569a1f",
      tool_finding_id:
        "01f6b20c375f1bba67df6ce7640aacd835a49133671c8ae73fc3e447040a9bcb",
      tool: "slither",
      rule_id: "tx-origin",
      description:
        "Example.changeOwner(address) (Contract.sol#1) uses tx.origin for authorization: require(bool,string)(tx.origin == owner,Unauthorized) (Contract.sol#1)",
      severity: "Medium",
      confidence: "Medium",
      reference:
        "https://github.com/crytic/slither/wiki/Detector-Documentation#dangerous-usage-of-txorigin",
      locations: [{ file: "Contract.sol", start_line: 1, end_line: 1 }],
    },
    {
      finding_id:
        "d7b3b118519adfd1917cc51328080c99b40cf2f6f10a74b8aa5ccb4443623f9e",
      tool_finding_id:
        "e17901cfa581c3138cb1c3371de9a2b0fcfdbcb47482a1c2a1bd227e399ae8d0",
      tool: "slither",
      rule_id: "missing-zero-check",
      description:
        "Example.changeOwner(address).newOwner (Contract.sol#1) lacks a zero-check on :\n\t\t- owner = newOwner (Contract.sol#1)",
      severity: "Low",
      confidence: "Medium",
      reference:
        "https://github.com/crytic/slither/wiki/Detector-Documentation#missing-zero-address-validation",
      locations: [{ file: "Contract.sol", start_line: 1, end_line: 1 }],
    },
  ],
};
ok(staticIngestSchema, staticBody, "real static output");
ok(
  staticIngestSchema,
  { ...staticBody, finding_count: 0, findings: [] },
  "clean contract, zero findings",
);
bad(
  staticIngestSchema,
  { ...staticBody, status: "failed" },
  "static status not completed",
);
bad(
  staticIngestSchema,
  {
    ...staticBody,
    findings: [{ ...staticBody.findings[0], severity: "Weird" }],
  },
  "unknown static severity",
);
bad(
  staticIngestSchema,
  { ...staticBody, findings: [{ ...staticBody.findings[0], finding_id: "" }] },
  "empty finding_id",
);

// parsed output keeps known and extra fields, and fills missing locations
const parsedStatic = staticIngestSchema.parse({
  ...staticBody,
  findings: [
    { ...staticBody.findings[0], extra_field: 1 },
    { ...staticBody.findings[1], locations: undefined },
  ],
});
assert.equal(
  parsedStatic.findings[0].tool_finding_id,
  staticBody.findings[0].tool_finding_id,
);
assert.equal(
  (parsedStatic.findings[0] as Record<string, unknown>).extra_field,
  1,
);
assert.deepEqual(parsedStatic.findings[1].locations, []);

// ----- RAG: your real samples -----
const ragBody = {
  audit_id: "uuid",
  status: "completed",
  context: {
    contracts: [
      {
        name: "LendingPool",
        file: "src/LendingPool.sol",
        is_proxy: false,
        implementation: null,
      },
    ],
    constructor_params: {},
  },
  hypotheses: [
    {
      id: "h1",
      title: "Spot price oracle can be manipulated",
      location: {
        file: "src/LendingPool.sol",
        contract: "LendingPool",
        function: "borrow",
        lines: [112, 140],
      },
      vuln_class: "price_manipulation",
      reason:
        "Collateral value is read from one DEX pool in the same transaction.",
      preconditions: ["needs flash loan", "pool has low liquidity"],
      attack_idea:
        "Skew the pool price, borrow against inflated collateral, leave bad debt.",
      similar_incidents: [
        { source: "defihacklabs", name: "Cream Finance 2021" },
      ],
      confidence: 0.78,
      severity: "high",
    },
  ],
  error: null,
};
ok(ragIngestSchema, ragBody, "real RAG output");
ok(ragIngestSchema, { ...ragBody, hypotheses: [] }, "RAG with no hypotheses");
bad(
  ragIngestSchema,
  { ...ragBody, status: "failed" },
  "RAG status not completed",
);
bad(
  ragIngestSchema,
  { ...ragBody, hypotheses: [{ ...ragBody.hypotheses[0], confidence: 1.5 }] },
  "RAG confidence above 1",
);
bad(
  ragIngestSchema,
  { ...ragBody, hypotheses: [{ ...ragBody.hypotheses[0], severity: "info" }] },
  "RAG severity not in the 4 levels",
);

// ----- triage -----
const triageBody = {
  decisions: [
    {
      finding_ref: "h1",
      decision: "SIMULATE",
      score: 0.8,
      reason: "High severity, both sources agree",
    },
    { finding_id: "some-uuid", decision: "SKIP" },
  ],
};
ok(triageSchema, triageBody, "triage");
bad(triageSchema, { decisions: [] }, "triage empty");
bad(
  triageSchema,
  { decisions: [{ finding_ref: "h1", decision: "MAYBE" }] },
  "triage bad decision",
);
bad(
  triageSchema,
  { decisions: [{ decision: "SKIP" }] },
  "triage without any reference",
);
bad(
  triageSchema,
  { decisions: [{ finding_ref: "h1", decision: "SKIP", score: 2 }] },
  "triage score above 1",
);

// ----- simulation -----
const result = {
  status: "success",
  revert_reason: null,
  profit_native: 0,
  gas_used: 21000,
  execution_trace: "[PASS] testBaseline()",
  duration_ms: 1200,
};
ok(simulationSchema, { mode: "baseline", result }, "baseline");
ok(
  simulationSchema,
  {
    mode: "exploit_attempt",
    finding_ref: "h1",
    exploit_code: "contract Exploit {}",
    result: { ...result, profit_native: 1.5 },
  },
  "exploit attempt by finding_ref",
);
ok(
  simulationSchema,
  {
    mode: "exploit_attempt",
    finding_id: "uuid",
    attempt_no: 2,
    exploit_code: "x",
    result: { ...result, status: "revert", revert_reason: "Reentrancy guard" },
  },
  "exploit attempt by finding_id with attempt_no",
);
ok(
  simulationSchema,
  { mode: "baseline", result: { ...result, execution_trace: undefined } },
  "missing trace defaults to empty",
);
bad(simulationSchema, { mode: "baseline" }, "baseline without result");
bad(
  simulationSchema,
  { mode: "exploit_attempt", finding_ref: "h1", result },
  "attempt without exploit_code",
);
bad(
  simulationSchema,
  { mode: "exploit_attempt", exploit_code: "x", result },
  "attempt without any finding reference",
);
bad(simulationSchema, { mode: "other", result }, "unknown mode");
bad(
  simulationSchema,
  { mode: "baseline", result: { ...result, status: "pending" } },
  "unknown sandbox status",
);

// ----- complete -----
ok(completeSchema, { status: "COMPLETE" }, "complete");
ok(
  completeSchema,
  { status: "FAILED", error_message: "RAG timed out" },
  "failed with message",
);
bad(completeSchema, { status: "DONE" }, "complete bad status");

console.log("schemas: all checks passed");
