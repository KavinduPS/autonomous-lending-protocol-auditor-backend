import { prisma } from "../src/config/db.js";

async function main() {
  await prisma.vulnerabilityCategory.createMany({
    data: [
      { code: "reentrancy", name: "Reentrancy" },
      { code: "oracle_manipulation", name: "Oracle manipulation" },
      { code: "code_quality", name: "Code quality" },
    ],
    skipDuplicates: true,
  });

  // Audit 1: complete, all three components have output (comparison demo)
  const done = await prisma.audit.create({
    data: {
      userId: "sample-user-id",
      contractName: "VulnerableBank",
      sourceUri: "uploads/VulnerableBank.sol",
      status: "COMPLETE",
      completedAt: new Date(),
      baseline: { totalDeposits: "100 ETH", attackerBalance: "0 ETH" },
      stages: {
        create: [
          { stage: "STATIC", status: "COMPLETE" },
          { stage: "RAG", status: "COMPLETE" },
          { stage: "EPA", status: "COMPLETE" },
        ],
      },
      findings: {
        create: [
          {
            category: { connect: { code: "reentrancy" } },
            title: "Reentrancy in withdraw()",
            severity: "HIGH",
            detectedBy: ["slither", "rag"],
            verificationStatus: "CONFIRMED",
            detections: {
              create: [
                {
                  source: "SLITHER",
                  ruleId: "reentrancy-eth",
                  severity: "HIGH",
                  confidence: "MEDIUM",
                  description:
                    "External call sends ETH before balances is updated.",
                  file: "VulnerableBank.sol",
                  lineStart: 22,
                  lineEnd: 30,
                  raw: {
                    check: "reentrancy-eth",
                    impact: "High",
                    confidence: "Medium",
                  },
                },
                {
                  source: "RAG",
                  ruleId: null,
                  severity: "HIGH",
                  confidence: "HIGH",
                  description:
                    "withdraw() follows the pattern seen in past lending protocol reentrancy incidents.",
                  file: "VulnerableBank.sol",
                  lineStart: 22,
                  lineEnd: 30,
                  raw: { note: "sample rag output" },
                },
              ],
            },
            exploitAttempts: {
              create: [
                {
                  attemptNo: 1,
                  outcome: "CONFIRMED",
                  evidence: {
                    attackerBalance: "100 ETH",
                    bankBalance: "0 ETH",
                  },
                },
              ],
            },
          },
          {
            category: { connect: { code: "oracle_manipulation" } },
            title: "Spot price used for collateral value",
            severity: "MEDIUM",
            detectedBy: ["rag"],
            verificationStatus: "NOT_CONFIRMED",
            detections: {
              create: [
                {
                  source: "RAG",
                  severity: "MEDIUM",
                  confidence: "MEDIUM",
                  description:
                    "Collateral is priced from a single pool spot price.",
                  file: "VulnerableBank.sol",
                  lineStart: 48,
                  lineEnd: 52,
                  raw: { note: "sample rag output" },
                },
              ],
            },
            exploitAttempts: {
              create: [{ attemptNo: 1, outcome: "NOT_CONFIRMED" }],
            },
          },
          {
            category: { connect: { code: "code_quality" } },
            title: "Outdated Solidity version pragma",
            severity: "INFO",
            detectedBy: ["slither"],
            detections: {
              create: [
                {
                  source: "SLITHER",
                  ruleId: "solc-version",
                  severity: "INFO",
                  confidence: "HIGH",
                  description: "Pragma allows versions with known issues.",
                  file: "VulnerableBank.sol",
                  lineStart: 2,
                  lineEnd: 2,
                  raw: {
                    check: "solc-version",
                    impact: "Informational",
                    confidence: "High",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  // Audit 2: still running (status gating demo)
  const running = await prisma.audit.create({
    data: {
      userId: "sample-user-id",
      contractName: "PendingVault",
      sourceUri: "uploads/PendingVault.sol",
      status: "ANALYZING",
      stages: {
        create: [
          { stage: "STATIC", status: "COMPLETE" },
          { stage: "RAG", status: "RUNNING" },
          { stage: "EPA", status: "PENDING" },
        ],
      },
    },
  });

  console.log("Complete audit:", done.id);
  console.log("Running audit:", running.id);
}

main().finally(() => prisma.$disconnect());
