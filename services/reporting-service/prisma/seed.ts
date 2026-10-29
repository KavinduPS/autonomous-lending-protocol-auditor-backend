import { prisma } from "../src/config/db.js";

const categories = [
  {
    code: "reentrancy",
    name: "Reentrancy",
    defaultMitigation:
      "Update state before making external calls (checks-effects-interactions) and add a reentrancy guard such as OpenZeppelin's ReentrancyGuard to functions that move funds.",
  },
  {
    code: "access_control",
    name: "Access Control",
    defaultMitigation:
      "Protect privileged functions with explicit role or owner checks, follow least privilege, and never use tx.origin for authorization.",
  },
  {
    code: "price_manipulation",
    name: "Price Manipulation",
    defaultMitigation:
      "Do not price assets from a single pool's spot price. Use time-weighted average prices, multiple sources and sanity bounds on price changes.",
  },
  {
    code: "oracle",
    name: "Oracle Manipulation",
    defaultMitigation:
      "Use reputable oracles with staleness and deviation checks, add fallback feeds, and pause sensitive operations when the data looks wrong.",
  },
  {
    code: "flash_loan",
    name: "Flash Loan Attack",
    defaultMitigation:
      "Make sensitive logic resistant to balance changes inside a single transaction: use snapshot or time-weighted accounting and limit how much can change per block.",
  },
  {
    code: "integer_overflow",
    name: "Integer Overflow / Underflow",
    defaultMitigation:
      "Use Solidity 0.8 or later checked arithmetic, review every unchecked block, and validate casts and bounds on user-supplied values.",
  },
  {
    code: "logic_error",
    name: "Business Logic Error",
    defaultMitigation:
      "Write down the contract's invariants, cover them with unit and fuzz tests, and get an independent review of the business logic.",
  },
  {
    code: "other",
    name: "Other",
    defaultMitigation:
      "Review the finding manually against its description and the detector's reference, then fix or document the accepted risk.",
  },
];

async function main() {
  for (const c of categories) {
    await prisma.vulnerabilityCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, defaultMitigation: c.defaultMitigation },
      create: { ...c, owaspScRef: null },
    });
  }

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
            category: { connect: { code: "oracle" } },
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
            category: { connect: { code: "other" } },
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
