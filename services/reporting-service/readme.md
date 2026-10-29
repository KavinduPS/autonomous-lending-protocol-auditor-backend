# Reporting Service

One microservice in the **Autonomous Lending Protocol Auditor**, a platform that audits DeFi lending
contracts. This service stores what the other services find and presents it as one report. Its main
job is to put three views of the same audit side by side:

1. **Normal execution:** the protocol running on a chain fork with no exploit (the baseline).
2. **Static vs RAG:** what Slither and the RAG LLM each reported, and where they agree or differ.
3. **Exploit simulation:** what happened when the exploit was run in the sandbox, compared with the baseline.

## 1. How it fits in the platform

```mermaid
flowchart LR
  FE[Frontend] --> GW["API gateway<br/>verifies JWT, sets x-user-id"]
  GW -->|"/api/reports/*"| RR

  subgraph RS["Reporting service (port 3003)"]
    direction TB
    RR["report.routes<br/>userContext"] --> RC[report.controller]
    RC --> RB[report.builder]
    RC --> CB[comparison.builder]
    IR["ingest.routes<br/>internalAuth"] --> IC["ingest.controller<br/>zod validation"]
    IC --> IS[ingest.service]
    IS --> MS[merge.service]
    IS --> MP[mappers]
  end

  ST[Static service] -->|"/internal/audits/:id/static"| IR
  RAG[RAG service] -->|"/internal/audits/:id/rag"| IR
  GATE[Decision gate] -->|"/internal/audits/:id/triage"| IR
  SBX[Sandbox] -->|"/internal/audits/:id/simulation"| IR
  ORCH[Orchestrator] -->|"/internal/audits, /complete"| IR

  RC --> DB[(PostgreSQL)]
  IS --> DB
  MS --> DB
```

There are two kinds of caller:

| Path prefix                | Who calls it                | How they prove who they are                                      |
| -------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `/internal/...` (writes)   | Other backend services only | `x-service-key` header, must equal `INTERNAL_API_KEY`            |
| `/api/reports/...` (reads) | Users, through the gateway  | `x-user-id` header, set by the gateway after it verifies the JWT |

The gateway never routes `/internal/*`. The service trusts `x-user-id` because only the gateway can
reach it, so in production it must not be exposed directly.

## 2. Data model

Six tables. Everything about one audit hangs off `audits`.

```mermaid
erDiagram
  AUDITS ||--o{ AUDIT_STAGES : has
  AUDITS ||--o{ FINDINGS : has
  VULNERABILITY_CATEGORIES ||--o{ FINDINGS : classifies
  FINDINGS ||--o{ DETECTIONS : "up to 2 (static, RAG)"
  FINDINGS ||--o{ EXPLOIT_ATTEMPTS : has

  AUDITS {
    string id PK
    string user_id
    string status
    json baseline
  }
  FINDINGS {
    string id PK
    string audit_id FK
    string category FK
    string severity
    string verification_status
  }
  DETECTIONS {
    string id PK
    string finding_id FK
    string source
    string source_ref
  }
  EXPLOIT_ATTEMPTS {
    string id PK
    string finding_id FK
    int attempt_no
    string outcome
  }
```

### `audits`: one audit request

| Field                                                  | Meaning                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `id`                                                   | The audit id chosen by the caller (the orchestrator)                                 |
| `user_id`                                              | Owner. Every read is filtered by it                                                  |
| `contract_name`, `source_uri`                          | What was audited and where the source came from                                      |
| `status`                                               | `PENDING` (created), `ANALYZING` (first result received), `COMPLETE`, `FAILED`       |
| `error_message`                                        | Why it failed, when `FAILED`                                                         |
| `baseline`                                             | JSON of the normal-execution run: status, profit, gas, duration, chain, block, trace |
| `chain`, `block_number`                                | The fork the simulation ran on                                                       |
| `source_sha256`, `slither_version`, `compiler_version` | Scope details from the static service                                                |
| `created_at`, `completed_at`, `deleted_at`             | Timestamps. `deleted_at` is a soft delete and hidden from every read                 |

### `audit_stages`: progress of one stage

| Field               | Meaning                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `audit_id`, `stage` | Unique together. Stages: `STATIC`, `RAG`, `SIMULATION` (`EPA` exists but is unused) |
| `status`            | `PENDING`, `RUNNING`, `COMPLETE`, `FAILED`, `SKIPPED`                               |
| `metrics`           | JSON stage details, such as tool versions and counts                                |

### `findings`: one merged issue

| Field                                                              | Meaning                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `category`                                                         | Foreign key to `vulnerability_categories.code`                                  |
| `title`, `severity`                                                | Severity is the highest of its detections                                       |
| `detected_by`                                                      | `["slither"]`, `["rag"]` or both                                                |
| `file`, `line_start`, `line_end`, `contract_name`, `function_name` | Where the issue is. RAG's values win when both sources reported                 |
| `triage_decision`, `triage_score`, `triage_reason`                 | The decision gate's verdict: `SIMULATE` or `SKIP`                               |
| `verification_status`                                              | `UNVERIFIED`, `CONFIRMED` or `NOT_CONFIRMED`, derived from the exploit attempts |

### `detections`: what one source said about a finding

| Field                                           | Meaning                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `finding_id`, `source`                          | Unique together: a finding has at most one `SLITHER` and one `RAG` detection                                               |
| `source_ref`                                    | The other service's own id (static `finding_id`, RAG hypothesis `id`). Used to resolve references in triage and simulation |
| `rule_id`                                       | Slither detector name. Empty for RAG                                                                                       |
| `severity`, `confidence`                        | Already converted to our scale                                                                                             |
| `description`, `file`, `line_start`, `line_end` | What and where, as reported by that source                                                                                 |
| `raw`                                           | The original item from the other service, unchanged (keeps data we do not map, such as the RAG 0 to 1 score)               |

### `exploit_attempts`: one sandbox run against a finding

| Field                      | Meaning                                              |
| -------------------------- | ---------------------------------------------------- |
| `finding_id`, `attempt_no` | Unique together. A finding can have several attempts |
| `poc_code`                 | The exploit code that was run                        |
| `outcome`                  | `CONFIRMED`, `NOT_CONFIRMED` or `ERROR`              |
| `evidence`                 | JSON: status, revert reason, profit, gas, duration   |
| `environment`              | JSON: chain and block number                         |
| `trace`                    | Raw Forge output                                     |

### `vulnerability_categories`: reference data

Eight rows, seeded: `reentrancy`, `access_control`, `price_manipulation`, `oracle`, `flash_loan`,
`integer_overflow`, `logic_error`, `other`. Each has a `name` and a `default_mitigation` that becomes
the report's recommendation.

## 3. Life of an audit

```mermaid
sequenceDiagram
  participant O as Other services
  participant R as Reporting service
  participant U as User via gateway

  O->>R: POST /internal/audits
  O->>R: POST /internal/audits/:id/static
  O->>R: POST /internal/audits/:id/rag
  Note over R: Detections are merged into findings by file and line overlap
  O->>R: POST /internal/audits/:id/triage
  O->>R: POST /internal/audits/:id/simulation (baseline)
  O->>R: POST /internal/audits/:id/simulation (exploit attempt)
  O->>R: POST /internal/audits/:id/complete
  U->>R: GET /api/reports/:id
  U->>R: GET /api/reports/:id/comparison
```

The ingest endpoints accept the other services' current outputs unchanged. This service does all the
conversion, so the other services do not have to change to fit it.

## 4. Rules the service applies

**Merging static and RAG** (`merge.service.ts`). A new detection joins an existing finding when all of
these hold; otherwise it becomes a new finding:

1. The files match, or either side is `Contract.sol` (static always reports that name for single-file submissions).
2. The line ranges overlap (touching ends count).
3. The finding has no detection from the same source yet.

If several findings qualify, the one with the largest overlap wins. Detections with no file or no
line numbers never merge. When both sources are present, RAG supplies title, location, contract and
function, and the category is the first one that is not `other`. Whichever source arrives first,
the result is the same.

**Severity** (`mappers.ts`):

| Source value                            | Stored as                           |
| --------------------------------------- | ----------------------------------- |
| Slither `High`, `Medium`, `Low`         | `HIGH`, `MEDIUM`, `LOW`             |
| Slither `Informational`, `Optimization` | `INFO`                              |
| RAG `critical`, `high`, `medium`, `low` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |

A finding's severity is the highest among its detections. Static confidence maps directly. RAG
confidence is a 0 to 1 score: 0.75 and above is `HIGH`, 0.5 and above is `MEDIUM`, below that `LOW`.

**Categories.** Slither detectors are mapped by name in `src/constants/slitherDetectors.ts` (for
example `reentrancy-*` to `reentrancy`, `tx-origin` to `access_control`, `pyth-*` to `oracle`);
everything else is `other`. That file also holds a readable title for each detector. RAG's
`vuln_class` is used as the category code, and an unknown class becomes `other`. Slither has no
detectors for price manipulation, flash loans or overflow, so those categories can only come from RAG.

**Simulation outcome and labels:**

| Sandbox status | Outcome         | Meaning                                                      |
| -------------- | --------------- | ------------------------------------------------------------ |
| `success`      | `CONFIRMED`     | The exploit ran and the test passed                          |
| `revert`       | `NOT_CONFIRMED` | The exploit ran and failed                                   |
| `failed`       | `ERROR`         | Compile error or crash, says nothing about the vulnerability |

A finding is `CONFIRMED` if any attempt is, else `NOT_CONFIRMED` if any attempt is, else `UNVERIFIED`.
The report label is derived when read: **Confirmed**, **Not confirmed**, **Could not run** (all
attempts errored), **Skipped** (the gate said skip) or **Not tested**.

**Comparison with the baseline.** For each finding the best attempt is the latest `CONFIRMED` one,
or else the latest that is not `ERROR`. `profitNativeDelta` is its profit minus the baseline profit,
and `gasRatio` is its gas divided by the baseline gas. These are `null` when there is no baseline,
no usable attempt, or the baseline gas is 0.

**Profit caveat.** The sandbox measures native currency only. A `profitNative` of 0 means "no native
currency movement detected", never "no impact". The report repeats this in `notes`.

## 5. Endpoints

### Ingest, internal (`x-service-key`)

| Method and path                        | Body                                                                                                   | Notes                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `POST /internal/audits`                | `{ audit_id, user_id, contract_name, source_uri, chain?, block_number? }`                              | 201. 409 if the id exists                       |
| `POST /internal/audits/:id/static`     | Static service `AnalysisResponse`                                                                      | `status` must be `completed`                    |
| `POST /internal/audits/:id/rag`        | RAG service `AnalysisResponse`                                                                         | `status` must be `completed`                    |
| `POST /internal/audits/:id/triage`     | `{ decisions: [{ finding_ref \| finding_id, decision: SIMULATE \| SKIP, score?, reason? }] }`          | Unresolved references come back in `unresolved` |
| `POST /internal/audits/:id/simulation` | `{ mode: baseline \| exploit_attempt, finding_ref?, finding_id?, attempt_no?, exploit_code?, result }` | `result` is the sandbox `ExecutionResult`       |
| `POST /internal/audits/:id/complete`   | `{ status: COMPLETE \| FAILED, error_message? }`                                                       | Finishes running stages                         |

Reposting static or RAG **replaces** that source's results for the audit: its detections are
deleted, findings left empty are removed (unless they have attempts), and the new items are merged.
Each ingest runs in a single database transaction. Errors: 400 invalid body, 401 bad key, 404
unknown audit or finding, 409 duplicate audit, 413 body over 5 MB.

### Read (`x-user-id`, only the caller's own audits)

| Method and path                                    | Returns                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/reports`                                 | The user's audits with severity counts                         |
| `GET /api/reports/meta/severity-levels`            | Severity definitions                                           |
| `GET /api/reports/:auditId`                        | The full report (below)                                        |
| `GET /api/reports/:auditId/comparison`             | The three-way comparison (below). Optional `?findingId=`       |
| `GET /api/reports/:auditId/findings/:findingId`    | One finding with its detections (including `raw`) and attempts |
| `GET /api/reports/:auditId/simulations/baseline`   | The baseline run with trace                                    |
| `GET /api/reports/:auditId/simulations/:attemptId` | One attempt with exploit code and trace                        |

### The full report

`summary` (counts by severity, how many findings each source flagged, how many were simulated and
confirmed), `scope`, `stages`, `baseline`, a compact `comparison` matrix, and `findings` sorted by
severity. Each finding shows its location, verification label, triage, recommendation and three
components: `staticAnalysis`, `ragLlm` and `simulation`. A component that did not report is `null`.
If the audit is not `COMPLETE`, only the header, scope and stages are returned with an empty
`findings` list. Traces and exploit code never appear here.

### The comparison

Works at any audit status. Three sections, each with `available` and a `reason` when it is not:

```text
{
  audit,
  normalExecution:   { available, reason, baseline, links },
  staticVsRag:       { available, reason, summary, findings[] },   // agreement: BOTH | STATIC_ONLY | RAG_ONLY, severityMatch
  exploitSimulation: { available, reason, summary, findings[] },   // label, triage, attempts[], vsBaseline
  notes
}
```

`staticVsRag` is available only once both the STATIC and RAG stages are complete.
`normalExecution` needs a recorded baseline. `exploitSimulation` needs a triage decision, an
attempt, or a started simulation stage.

## 6. Code map

```text
prisma/
  schema.prisma              Tables above
  seed.ts                    Seeds the 8 categories
prisma.config.ts             Prisma 7 config (schema, migrations, seed command)
src/
  index.ts                   Express app, route mounting, error handler
  config/db.ts               Prisma client
  constants/                 slitherDetectors.ts (categories and titles), severityLevels.ts
  schemas/ingest.schema.ts   zod validation for the six ingest bodies
  lib/mappers.ts             Pure conversion of static and RAG items to our model
  middleware/                internalAuth.ts, userContext.ts
  routes/                    ingest.routes.ts, report.routes.ts
  controllers/               ingest.controller.ts (validation and status codes), report.controller.ts
  services/
    merge.service.ts         Finding matching and merge
    ingest.service.ts        All writes, each in a transaction
    report.builder.ts        Full report (pure)
    comparison.builder.ts    Three-way comparison (pure)
  scripts/                   check-*.ts (tests) and seed-demo.ts
demo/requests.http           VS Code REST Client requests in demo order
```

## 7. Running it

Environment (`reporting-service/.env`):

```text
DATABASE_URL=postgresql://user:password@localhost:5433/dbname
INTERNAL_API_KEY=a-long-random-value
PORT=3003
```

```bash
npm install
npx prisma migrate dev        # create or update tables
npx prisma db seed            # the 8 categories
npm run dev                   # http://localhost:3003
npm run demo:seed -- <user-id>  # four demo audits, sent through the real endpoints
```

The demo audits: **A** (complete, all three comparison sections filled, static and RAG disagree on
severity, exploit confirmed), **B** (RAG-only finding, two reverted attempts), **C** (skipped by the
gate), **D** (still running, so the comparison shows what is not available yet).

Checks (each prints `... all checks passed`):

```bash
npx tsx src/scripts/check-mappers.ts
npx tsx src/scripts/check-schemas.ts
npx tsx src/scripts/check-report.ts
npx tsx src/scripts/check-comparison.ts
npx tsx src/scripts/check-merge.ts     # needs the database
npx tsx src/scripts/check-ingest.ts    # needs the database
```

## 8. Design notes

- `Finding.detectedBy` holds lowercase `"slither"` and `"rag"`.
- Duplicate ids inside one posted body are ignored after the first.
- Mapping errors (an unknown severity, say) reject the whole body with a 400 before anything is written.
- `/api/reports/meta/severity-levels` needs the same login as the rest, because the gateway protects `/api/reports`.

## 9. Known limitations

- Matching is by file and line overlap only, and static reports every file as `Contract.sol`.
- `profit_native` covers native currency only, so token gains are invisible to it.
- One baseline per audit is compared against every finding's exploit. It is one run on the fork, not a full state snapshot.
- A real Slither run produces many INFO findings. They are all stored and counted. There is no severity filter on the read endpoints yet.
- Access control is header based: the gateway verifies the JWT and sets `x-user-id`, and this service trusts it.

## 10. Not built yet

PDF export, report versioning, re-audits, state snapshot diffs, message-queue consumers, and a
frontend. The other services still need to call the ingest endpoints.
