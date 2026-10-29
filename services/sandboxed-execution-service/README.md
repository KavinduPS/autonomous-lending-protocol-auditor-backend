# Sandboxed Execution Service

Part of the **Automated Smart Contract Audit Platform for DeFi Lending Protocols**.  
This microservice answers the critical question: **Does a given exploit proof-of-concept (PoC) actually work, and what happens when it runs?**

---

## 1. Overview & Platform Architecture

In the overall audit pipeline:
```
[User Contract Submission]
         │
         ▼
[Static Analysis (Slither)] + [RAG-LLM (Risk & Vulnerabilities)]
         │
         ▼
[Decision Gate] ── (finding looks exploitable) ──► [Exploit Planning Agent (EPA)]
                                                              │
                                            (generates Solidity PoC)
                                                              │
                                                              ▼
                                             [Sandboxed Execution Service]
                                                              │
                                          (forks chain with Anvil, runs Forge)
                                                              │
                                                              ▼
                                                    [Result & Trace]
                                                              │
                                         ┌────────────────────┴────────────────────┐
                                         ▼                                         ▼
                                   [EPA Agent Loop]                       [Reporting Service]
                               (retry or finalize)                     (persisted execution_runs)
```

This service implements the **Concrete Execution Environment** (Section IV-C) inspired by the research paper:  
*Gervais & Zhou, "A1: AI Agent Smart Contract Exploit Generation" (arXiv:2507.05558)*.

---

## 2. Service Architecture (Two-Layer Design)

The service is split into two cleanly decoupled layers:
1. **API & Persistence Layer (Person B):**
   * Express HTTP endpoints (`/execute`, `/health`).
   * Strict input validation (`validateExecutionInput`).
   * Database persistence with PostgreSQL and Prisma 7 (`execution_runs` table).
   * Dual-route mounting (supports direct calls and API Gateway proxied calls under `/api/sandbox`).
2. **Concrete Execution Runtime (Person A):**
   * Process-level isolated Anvil chain forking on dynamic ports (`ports.ts`, `anvil.ts`).
   * Forge test execution against the forked state (`forge.ts`).
   * Attacker balance tracking and native profit computation (`profit.ts`).
   * Orchestration logic (`runExecution`).

---

## 3. API Reference

The service runs on **Port 8004** by default (and can also be accessed through API Gateway at port 3000 via `/api/sandbox`).

### 3.1 Health Check
* **Endpoint:** `GET /health` (or `GET /api/sandbox/health`)
* **Response (200 OK):**
```json
{
  "service": "sandboxed-execution-service",
  "status": "ok"
}
```

### 3.2 Execute Exploit PoC
* **Endpoint:** `POST /execute` (or `POST /api/sandbox/execute`)
* **Headers:** `Content-Type: application/json`

#### Request Body (`ExecutionInput`):
```json
{
  "audit_id": "audit-uuid-12345",
  "chain": "ethereum",
  "block_number": 20103189,
  "exploit_code": "pragma solidity ^0.8.19;\nimport \"forge-std/Test.sol\";\ncontract ExploitTest is Test {\n  function testExploit() public {\n    // exploit logic\n  }\n}",
  "mode": "baseline"
}
```

| Field | Type | Allowed Values | Description |
|---|---|---|---|
| `audit_id` | String | Non-empty string | Unique audit task ID from EPA / Platform |
| `chain` | String | `"ethereum"`, `"bsc"` | Target blockchain to fork |
| `block_number` | Integer | Positive integer (> 0) | Exact historical block height to fork from |
| `exploit_code` | String | Solidity code | Full Foundry test contract |
| `mode` | String | `"baseline"`, `"exploit_attempt"` | Execution run mode |

#### Success Response (200 OK - `ExecutionResult`):
```json
{
  "status": "success",
  "revert_reason": null,
  "profit_native": 12.5,
  "gas_used": 154230,
  "execution_trace": "[PASS] testExploit() (gas: 154230)...",
  "duration_ms": 3420
}
```

* `status`: 
  * `"success"` — Exploit test executed and passed (`[PASS]`).
  * `"revert"` — Exploit reverted or assertion failed (`[FAIL: ...]`).
  * `"failed"` — Compilation error or crash before tests could run.
* `revert_reason`: Specific error message or null if passed.
* `profit_native`: Net ETH/BNB gained by the default attacker address (`0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`).
* `gas_used`: Total gas consumed in the execution.
* `execution_trace`: Raw Forge execution trace (`-vvvvv`).
* `duration_ms`: Total execution time in milliseconds.

#### Error Responses:
* **400 Bad Request:** Validation failure (e.g. invalid mode, missing fields).
```json
{
  "error": "Missing or invalid field: 'mode' must be either 'baseline' or 'exploit_attempt'"
}
```
* **500 Internal Server Error:** Unexpected runtime crash (logged safely without leaking raw stack trace).
```json
{
  "error": "Internal execution server error"
}
```

---

## 4. Database & Persistence Layer

Each run is automatically saved to the dedicated `execution_db` PostgreSQL database using Prisma 7.

### Schema (`prisma/schema.prisma`):
```prisma
model ExecutionRun {
  id             String   @id @default(uuid())
  auditId        String   @map("audit_id")
  mode           String   // "baseline" | "exploit_attempt"
  chain          String
  blockNumber    Int      @map("block_number")
  status         String   // "success" | "failed" | "revert"
  revertReason   String?  @map("revert_reason")
  profitNative   Float    @map("profit_native")
  gasUsed        Int      @map("gas_used")
  executionTrace String   @map("execution_trace") @db.Text
  durationMs     Int      @map("duration_ms")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("execution_runs")
}
```

---

## 5. Environment Variables (`.env`)

Create a `.env` file in `services/sandboxed-execution-service/` by copying `.env.example`:

```env
PORT=8004
DATABASE_URL="postgresql://audit:change_me@localhost:5433/execution_db?schema=public"
ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
BSC_RPC_URL="https://binance.llamarpc.com"
```

| Variable | Description |
|---|---|
| `PORT` | HTTP port the service listens on (default: `8004`) |
| `DATABASE_URL` | PostgreSQL connection string for `execution_db` |
| `ETH_RPC_URL` | Archive/fork-capable RPC endpoint for Ethereum (Alchemy/Infura) |
| `BSC_RPC_URL` | Archive/fork-capable RPC endpoint for BSC |

---

## 6. How to Set Up, Run & Test

### 6.1 Prerequisites
1. **Foundry** (for Anvil and Forge):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   anvil --version
   forge --version
   ```
2. **Node.js** (v20+ or v22+) & **npm**
3. **Docker & PostgreSQL** (via root `docker-compose.dev.yml`)

### 6.2 Installation & Build
```bash
cd services/sandboxed-execution-service
npm install
npm run build
```

### 6.3 Database Migration
Make sure PostgreSQL is running, then run Prisma migration:
```bash
npx prisma migrate dev --name init
```

### 6.4 Start the Service
```bash
# In development mode (hot-reloading):
npm run dev

# Or in production mode:
npm start
```

### 6.5 Testing with cURL
```bash
curl -X POST http://localhost:8004/execute \
  -H "Content-Type: application/json" \
  -d '{
    "audit_id": "test-audit-001",
    "chain": "ethereum",
    "block_number": 20103189,
    "exploit_code": "pragma solidity ^0.8.19;\nimport \"forge-std/Test.sol\";\ncontract ExploitTest is Test {\n  function testPlaceholder() public {\n    assertTrue(true);\n  }\n}",
    "mode": "baseline"
  }'
```

---

## 7. Integration Guide for Other Microservices

### For Exploit Planning Agent (EPA):
* When an exploit PoC is synthesized by LLM, extract the Solidity test file.
* Send an HTTP `POST` to `http://sandboxed-execution-service:8004/execute` (or through API Gateway at `http://api-gateway:3000/api/sandbox/execute`).
* Inspect `status` and `execution_trace`:
  * If `status === "success"`, record PoC and profit.
  * If `status === "revert"`, feed `revert_reason` and `execution_trace` back into the next EPA prompt iteration to fix the exploit logic.

### For API Gateway:
* Proxies route `/api/sandbox/*` to `sandboxed-execution-service:8004`.
* Regular health ping `/health` reports service readiness.

### For Reporting Service:
* Can query execution outcomes directly from the `execution_runs` table in PostgreSQL or via future internal reporting queries.

---

## 8. Project File Structure

```
services/sandboxed-execution-service/
├── Dockerfile                   # Production container with Foundry + Node
├── .dockerignore
├── .env.example                 # Environment template
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma            # execution_runs database schema
├── prisma7.config.ts            # Prisma 7 CLI configuration
├── foundry-template/            # Base Foundry project template
└── src/
    ├── index.ts                 # Service entrypoint
    ├── api/
    │   ├── server.ts            # Express app & route definitions
    │   └── executeHandler.ts    # Validation, orchestration & persistence logic
    ├── db/
    │   └── client.ts            # Prisma client singleton (@prisma/adapter-pg)
    └── runtime/                 # Concrete execution runtime (Person A)
        ├── types.ts             # Shared ExecutionInput & ExecutionResult interfaces
        ├── ports.ts             # Concurrent port allocator
        ├── anvil.ts             # Anvil fork process lifecycle
        ├── forge.ts             # Forge test execution & parsing
        ├── profit.ts            # Native currency profit measurement
        ├── execute.ts           # Orchestrates fork + forge + profit
        └── manual-test.ts       # Standalone runtime test script
```
