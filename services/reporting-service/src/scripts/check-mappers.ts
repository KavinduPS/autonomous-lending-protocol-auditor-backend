import assert from "node:assert/strict";
import {
  buildDetectedBy,
  highestSeverity,
  mapRagConfidence,
  mapRagHypothesis,
  mapStaticFinding,
  mapStaticSeverity,
  MappingError,
  titleFromRuleId,
} from "../lib/mappers.js";

// ----- Static: your real output -----
const txOrigin = mapStaticFinding({
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
});
assert.equal(txOrigin.finding.title, "Dangerous use of tx.origin");
assert.equal(txOrigin.finding.categoryCode, "access_control");
assert.equal(txOrigin.finding.severity, "MEDIUM");
assert.equal(txOrigin.detection.confidence, "MEDIUM");
assert.equal(txOrigin.detection.file, "Contract.sol");
assert.equal(txOrigin.detection.lineStart, 1);
assert.equal(txOrigin.detection.lineEnd, 1);
assert.equal(txOrigin.detection.ruleId, "tx-origin");

const zeroCheck = mapStaticFinding({
  finding_id:
    "d7b3b118519adfd1917cc51328080c99b40cf2f6f10a74b8aa5ccb4443623f9e",
  rule_id: "missing-zero-check",
  description:
    "Example.changeOwner(address).newOwner (Contract.sol#1) lacks a zero-check on :\n\t\t- owner = newOwner (Contract.sol#1)",
  severity: "Low",
  confidence: "Medium",
  locations: [{ file: "Contract.sol", start_line: 1, end_line: 1 }],
});
assert.equal(zeroCheck.finding.title, "Missing zero address validation");
assert.equal(zeroCheck.finding.categoryCode, "other");
assert.equal(zeroCheck.finding.severity, "LOW");
assert.ok(zeroCheck.detection.description.includes("\n"));

// ----- Static: reentrancy, multiple locations, no locations, unknown rule -----
const re = mapStaticFinding({
  ...baseStatic("reentrancy-eth"),
  severity: "High",
  locations: [
    { file: "Contract.sol", start_line: 22, end_line: 30 },
    { file: "Contract.sol", start_line: 25, end_line: 25 },
  ],
});
assert.equal(re.finding.title, "Reentrancy (theft of ether)");
assert.equal(re.finding.categoryCode, "reentrancy");
assert.equal(re.finding.severity, "HIGH");
assert.equal(re.detection.lineStart, 22);
assert.equal(re.detection.lineEnd, 30);

const solc = mapStaticFinding({
  ...baseStatic("solc-version"),
  severity: "Informational",
});
assert.equal(solc.finding.title, "Incorrect Solidity version");
assert.equal(solc.finding.categoryCode, "other");
assert.equal(solc.finding.severity, "INFO");
assert.equal(solc.detection.lineStart, null);

const unknown = mapStaticFinding(baseStatic("brand-new-detector"));
assert.equal(unknown.finding.title, "Brand new detector");
assert.equal(unknown.finding.categoryCode, "other");

assert.equal(
  mapStaticFinding(baseStatic("pyth-unchecked-confidence")).finding
    .categoryCode,
  "oracle",
);
assert.equal(
  mapStaticFinding(baseStatic("reentrancy-unlimited-gas")).finding.categoryCode,
  "reentrancy",
);

// ----- RAG: your real sample -----
const r = mapRagHypothesis({
  id: "h1",
  title: "Spot price oracle can be manipulated",
  location: {
    file: "src/LendingPool.sol",
    contract: "LendingPool",
    function: "borrow",
    lines: [112, 140],
  },
  vuln_class: "price_manipulation",
  reason: "Collateral value is read from one DEX pool in the same transaction.",
  confidence: 0.78,
  severity: "high",
});
assert.equal(r.finding.categoryCode, "price_manipulation");
assert.equal(r.finding.severity, "HIGH");
assert.equal(r.detection.confidence, "HIGH");
assert.equal(r.detection.sourceRef, "h1");
assert.equal(r.detection.lineStart, 112);
assert.equal(r.detection.lineEnd, 140);
assert.equal(r.finding.contractName, "LendingPool");
assert.equal(r.finding.functionName, "borrow");
assert.equal((r.detection.raw as { confidence: number }).confidence, 0.78);

// RAG edge cases
assert.equal(
  mapRagHypothesis({ ...baseRag(), vuln_class: "nonsense" }).finding
    .categoryCode,
  "other",
);
assert.equal(
  mapRagHypothesis({ ...baseRag(), location: { lines: [] } }).detection
    .lineStart,
  null,
);
assert.equal(
  mapRagHypothesis({ ...baseRag(), location: { lines: [30, 10, 20] } })
    .detection.lineStart,
  10,
);

// Confidence boundaries
assert.equal(mapRagConfidence(0.75), "HIGH");
assert.equal(mapRagConfidence(0.5), "MEDIUM");
assert.equal(mapRagConfidence(0.49), "LOW");
assert.throws(() => mapRagConfidence(1.2), MappingError);

// Severity helpers
assert.equal(mapStaticSeverity("Optimization"), "INFO");
assert.throws(() => mapStaticSeverity("Weird"), MappingError);
assert.equal(highestSeverity(["LOW", "CRITICAL", "MEDIUM"]), "CRITICAL");

// Misc
assert.equal(titleFromRuleId("tx-origin"), "Tx origin");
assert.deepEqual(buildDetectedBy(["RAG", "SLITHER", "RAG"]), [
  "rag",
  "slither",
]);

function baseStatic(rule_id: string) {
  return {
    finding_id: "f-x",
    rule_id,
    description: "x",
    severity: "Low",
    confidence: "High",
  };
}

function baseRag() {
  return {
    id: "h9",
    title: "t",
    vuln_class: "other",
    reason: "r",
    confidence: 0.6,
    severity: "low",
  };
}

console.log("mappers: all checks passed");
