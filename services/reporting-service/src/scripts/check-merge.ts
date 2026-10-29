import assert from "node:assert/strict";
import { prisma } from "../config/db.js";
import { mapRagHypothesis, mapStaticFinding } from "../lib/mappers.js";
import {
  attachDetection,
  filesMatch,
  pickMergeTarget,
  rangesOverlap,
} from "../services/merge.service.js";

// ----- pure helpers -----
assert.equal(filesMatch("Contract.sol", "src/LendingPool.sol"), true);
assert.equal(filesMatch("src/A.sol", "./src/A.sol"), true);
assert.equal(filesMatch("src/A.sol", "src/B.sol"), false);
assert.equal(filesMatch(null, "Contract.sol"), false);
assert.equal(rangesOverlap(22, 30, 30, 40), true);
assert.equal(rangesOverlap(22, 30, 31, 40), false);
assert.equal(rangesOverlap(null, 30, 1, 5), false);
assert.equal(
  pickMergeTarget(
    [
      { id: "small", file: "Contract.sol", lineStart: 29, lineEnd: 31 },
      { id: "big", file: "Contract.sol", lineStart: 20, lineEnd: 35 },
    ],
    { file: "src/X.sol", lineStart: 25, lineEnd: 35 },
  ),
  "big",
);
assert.equal(
  pickMergeTarget([{ id: "a", file: "src/A.sol", lineStart: 1, lineEnd: 5 }], {
    file: "src/B.sol",
    lineStart: 1,
    lineEnd: 5,
  }),
  null,
);

// ----- sample inputs -----
const staticReentrancy = () =>
  mapStaticFinding({
    finding_id: "s1",
    rule_id: "reentrancy-eth",
    description: "External call sends ETH before balances is updated.",
    severity: "High",
    confidence: "Medium",
    locations: [{ file: "Contract.sol", start_line: 22, end_line: 30 }],
  });

const ragReentrancy = (id: string, lines: number[]) =>
  mapRagHypothesis({
    id,
    title: "Reentrancy in withdraw",
    location: {
      file: "src/LendingPool.sol",
      contract: "LendingPool",
      function: "withdraw",
      lines,
    },
    vuln_class: "reentrancy",
    reason: "Balance updated after external call.",
    confidence: 0.9,
    severity: "critical",
  });

async function newAudit(name: string) {
  return prisma.audit.create({
    data: { userId: "merge-check", contractName: name, sourceUri: "check" },
  });
}

async function findingsOf(auditId: string) {
  return prisma.finding.findMany({
    where: { auditId },
    include: { detections: true },
    orderBy: { lineStart: "asc" },
  });
}

async function main() {
  try {
    // ----- static first, then RAG -----
    const a = await newAudit("StaticThenRag");
    await prisma.$transaction(async (tx) => {
      const s = await attachDetection(tx, a.id, staticReentrancy());
      assert.equal(s.merged, false, "first detection creates a finding");

      const r = await attachDetection(tx, a.id, ragReentrancy("h1", [25, 35]));
      assert.equal(
        r.merged,
        true,
        "overlapping RAG merges into the static finding",
      );
      assert.equal(r.findingId, s.findingId);

      const r2 = await attachDetection(tx, a.id, ragReentrancy("h2", [26, 30]));
      assert.equal(
        r2.merged,
        false,
        "second RAG cannot join a finding that already has RAG",
      );

      const s2 = await attachDetection(
        tx,
        a.id,
        mapStaticFinding({
          finding_id: "s2",
          rule_id: "solc-version",
          description: "x",
          severity: "Informational",
          confidence: "High",
          locations: [{ file: "Contract.sol", start_line: 100, end_line: 110 }],
        }),
      );
      assert.equal(
        s2.merged,
        false,
        "non-overlapping static starts a new finding",
      );

      const noLines = await attachDetection(
        tx,
        a.id,
        mapStaticFinding({
          finding_id: "s3",
          rule_id: "pragma",
          description: "x",
          severity: "Informational",
          confidence: "High",
        }),
      );
      assert.equal(noLines.merged, false, "no line numbers never merges");
    });

    const fa = await findingsOf(a.id);
    assert.equal(fa.length, 4, "4 findings total");
    const merged = fa.find((f) => f.detections.length === 2)!;
    assert.ok(merged, "one finding has two detections");
    assert.deepEqual([...merged.detectedBy].sort(), ["rag", "slither"]);
    assert.equal(merged.severity, "CRITICAL");
    assert.equal(merged.title, "Reentrancy in withdraw");
    assert.equal(merged.file, "src/LendingPool.sol");
    assert.equal(merged.contractName, "LendingPool");
    assert.equal(merged.functionName, "withdraw");
    assert.equal(merged.categoryCode, "reentrancy");

    // ----- RAG first, then static: same end state -----
    const b = await newAudit("RagThenStatic");
    await prisma.$transaction(async (tx) => {
      const r = await attachDetection(tx, b.id, ragReentrancy("h1", [25, 35]));
      const s = await attachDetection(tx, b.id, staticReentrancy());
      assert.equal(s.merged, true);
      assert.equal(s.findingId, r.findingId);
    });
    const fb = await findingsOf(b.id);
    assert.equal(fb.length, 1);
    assert.equal(fb[0].detections.length, 2);
    assert.equal(fb[0].severity, "CRITICAL");
    assert.equal(fb[0].title, "Reentrancy in withdraw");
    assert.equal(fb[0].file, "src/LendingPool.sol");
    assert.equal(fb[0].categoryCode, "reentrancy");

    console.log("merge: all checks passed");
  } finally {
    await prisma.audit.deleteMany({ where: { userId: "merge-check" } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
