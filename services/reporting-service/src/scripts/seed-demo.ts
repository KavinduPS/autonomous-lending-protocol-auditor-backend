import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "../config/db.js";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3003";
const KEY = process.env.INTERNAL_API_KEY;
// Usage: npm run demo:seed -- <your-user-id>
const USER_ID = process.argv[2] ?? process.env.DEMO_USER_ID ?? "sample-user-id";

const IDS = {
  a: "demo-a-vulnerable-bank",
  b: "demo-b-lending-pool",
  c: "demo-c-simple-wallet",
  d: "demo-d-pending-vault",
};

// ---------- helpers ----------

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}/internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-key": KEY! },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`POST /internal${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const createBody = (id: string, name: string) => ({
  audit_id: id,
  user_id: USER_ID,
  contract_name: name,
  source_uri: `uploads/${name}.sol`,
  chain: "ethereum",
  block_number: 19000000,
});

const sf = (
  id: string,
  rule: string,
  severity: string,
  confidence: string,
  description: string,
  start: number,
  end: number,
) => ({
  finding_id: id,
  tool_finding_id: `tool-${id}`,
  tool: "slither",
  rule_id: rule,
  description,
  severity,
  confidence,
  reference: `https://github.com/crytic/slither/wiki/Detector-Documentation#${rule}`,
  locations: [{ file: "Contract.sol", start_line: start, end_line: end }],
});

const staticBody = (id: string, name: string, findings: object[]) => ({
  audit_id: id,
  status: "completed",
  finding_count: findings.length,
  metadata: {
    source_sha256: sha(name),
    slither_version: "0.11.6",
    compiler_version: "0.8.24+commit.e11b9ed9.Linux.g++",
  },
  findings,
});

const ragBody = (
  id: string,
  file: string,
  contract: string,
  hypotheses: object[],
) => ({
  audit_id: id,
  status: "completed",
  context: {
    contracts: [
      { name: contract, file, is_proxy: false, implementation: null },
    ],
    constructor_params: {},
  },
  hypotheses,
  error: null,
});

const run = (
  status: string,
  profit: number,
  gas: number,
  ms: number,
  trace: string,
  revert: string | null = null,
) => ({
  status,
  revert_reason: revert,
  profit_native: profit,
  gas_used: gas,
  execution_trace: trace,
  duration_ms: ms,
});

// ---------- audit A: complete, all three comparison sections filled ----------

async function seedA() {
  const id = IDS.a;
  await post("/audits", createBody(id, "VulnerableBank"));
  await post(
    `/audits/${id}/static`,
    staticBody(id, "VulnerableBank", [
      sf(
        "a-s1",
        "reentrancy-no-eth",
        "Medium",
        "Medium",
        "Reentrancy in VulnerableBank.withdraw(uint256) (Contract.sol#22-30): external call is made before the balance is updated.",
        22,
        30,
      ),
      sf(
        "a-s2",
        "solc-version",
        "Informational",
        "High",
        "Pragma version ^0.8.0 (Contract.sol#2) allows old versions.",
        2,
        2,
      ),
    ]),
  );
  await post(
    `/audits/${id}/rag`,
    ragBody(id, "src/VulnerableBank.sol", "VulnerableBank", [
      {
        id: "h1",
        title: "Reentrancy in withdraw()",
        location: {
          file: "src/VulnerableBank.sol",
          contract: "VulnerableBank",
          function: "withdraw",
          lines: [24, 34],
        },
        vuln_class: "reentrancy",
        reason:
          "The balance is updated after the external ETH transfer, so a malicious receiver can re-enter withdraw().",
        preconditions: ["Attacker contract implements receive()"],
        attack_idea:
          "Call withdraw() from a contract whose receive() calls withdraw() again until the bank is empty.",
        similar_incidents: [
          { source: "defihacklabs", name: "Cream Finance 2021" },
        ],
        confidence: 0.92,
        severity: "high",
      },
    ]),
  );
  await post(`/audits/${id}/triage`, {
    decisions: [
      {
        finding_ref: "h1",
        decision: "SIMULATE",
        score: 0.85,
        reason: "High severity and both sources point at the same lines.",
      },
      {
        finding_ref: "a-s2",
        decision: "SKIP",
        score: 0.1,
        reason: "Informational, no exploit path.",
      },
    ],
  });
  await post(`/audits/${id}/simulation`, {
    mode: "baseline",
    result: run(
      "success",
      0,
      210000,
      1800,
      "[PASS] testBaseline() (gas: 210000)",
    ),
  });
  await post(`/audits/${id}/simulation`, {
    mode: "exploit_attempt",
    finding_ref: "h1",
    exploit_code:
      "contract Attacker {\n  VulnerableBank bank;\n  constructor(address b) { bank = VulnerableBank(b); }\n  function attack() external payable { bank.deposit{value: 1 ether}(); bank.withdraw(1 ether); }\n  receive() external payable { if (address(bank).balance >= 1 ether) bank.withdraw(1 ether); }\n}",
    result: run(
      "success",
      100,
      480000,
      2600,
      "[PASS] testExploit() (gas: 480000)\nLogs:\n  attacker balance before: 1 ETH\n  attacker balance after: 101 ETH",
    ),
  });
  await post(`/audits/${id}/complete`, { status: "COMPLETE" });
}

// ---------- audit B: RAG-only finding, two reverted attempts ----------

async function seedB() {
  const id = IDS.b;
  await post("/audits", createBody(id, "LendingPool"));
  await post(`/audits/${id}/static`, staticBody(id, "LendingPool", []));
  await post(
    `/audits/${id}/rag`,
    ragBody(id, "src/LendingPool.sol", "LendingPool", [
      {
        id: "b-h1",
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
    ]),
  );
  await post(`/audits/${id}/triage`, {
    decisions: [
      {
        finding_ref: "b-h1",
        decision: "SIMULATE",
        score: 0.7,
        reason:
          "High severity price manipulation pattern, static analysis did not cover it.",
      },
    ],
  });
  await post(`/audits/${id}/simulation`, {
    mode: "baseline",
    result: run(
      "success",
      0,
      300000,
      2100,
      "[PASS] testBaseline() (gas: 300000)",
    ),
  });
  await post(`/audits/${id}/simulation`, {
    mode: "exploit_attempt",
    finding_ref: "b-h1",
    exploit_code:
      "contract PriceAttack { /* swap to skew the pool, then borrow */ }",
    result: run(
      "revert",
      0,
      120000,
      2400,
      "[FAIL: Price deviation check failed] testExploit() (gas: 120000)",
      "Price deviation check failed",
    ),
  });
  await post(`/audits/${id}/simulation`, {
    mode: "exploit_attempt",
    finding_ref: "b-h1",
    exploit_code: "contract PriceAttack2 { /* larger swap, then borrow */ }",
    result: run(
      "revert",
      0,
      90000,
      2200,
      "[FAIL: Insufficient liquidity] testExploit() (gas: 90000)",
      "Insufficient liquidity",
    ),
  });
  await post(`/audits/${id}/complete`, { status: "COMPLETE" });
}

// ---------- audit C: skipped by the gate ----------

async function seedC() {
  const id = IDS.c;
  await post("/audits", createBody(id, "SimpleWallet"));
  await post(
    `/audits/${id}/static`,
    staticBody(id, "SimpleWallet", [
      sf(
        "c-s1",
        "tx-origin",
        "Medium",
        "Medium",
        "SimpleWallet.changeOwner(address) (Contract.sol#10-14) uses tx.origin for authorization.",
        10,
        14,
      ),
    ]),
  );
  await post(
    `/audits/${id}/rag`,
    ragBody(id, "src/SimpleWallet.sol", "SimpleWallet", []),
  );
  await post(`/audits/${id}/triage`, {
    decisions: [
      {
        finding_ref: "c-s1",
        decision: "SKIP",
        score: 0.2,
        reason:
          "Owner-only path, no reachable exploit without a phishing step.",
      },
    ],
  });
  await post(`/audits/${id}/complete`, { status: "COMPLETE" });
}

// ---------- audit D: still running ----------

async function seedD() {
  const id = IDS.d;
  await post("/audits", createBody(id, "PendingVault"));
  await post(
    `/audits/${id}/static`,
    staticBody(id, "PendingVault", [
      sf(
        "d-s1",
        "missing-zero-check",
        "Low",
        "Medium",
        "PendingVault.setOwner(address).newOwner (Contract.sol#8) lacks a zero-check.",
        8,
        8,
      ),
    ]),
  );
  // no RAG, no simulation, no complete call: the audit stays ANALYZING
}

// ---------- main ----------

async function main() {
  if (!KEY) throw new Error("INTERNAL_API_KEY is not set in .env");

  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `The service is not reachable at ${BASE}. Start it with npm run dev first.`,
    );
  }

  // Start clean: removing an audit also removes its stages, findings, detections and attempts.
  await prisma.audit.deleteMany({ where: { id: { in: Object.values(IDS) } } });
  await prisma.$disconnect();

  await seedA();
  await seedB();
  await seedC();
  await seedD();

  console.log(`Demo data created for user "${USER_ID}":`);
  for (const [k, v] of Object.entries(IDS))
    console.log(`  ${k.toUpperCase()}: ${v}`);
  console.log(`\nTry: curl -s ${BASE}/api/reports -H "x-user-id: ${USER_ID}"`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
