# RAG LLM Service

> **Knowledge-Augmented Vulnerability Hypothesis Generator for Smart Contracts**  
> Autonomous Lending Protocol Auditor (ALPA) Backend Service

---

## 📌 Overview

The **RAG LLM Service** analyzes submitted Solidity smart contract projects and produces ranked, located vulnerability hypotheses. It integrates:
1. **Person A (Knowledge Base & Vector Store):** A PostgreSQL `pgvector` database holding **9,948 real Web3 security incidents, hack post-mortems (DeFiHackLabs), and audit findings (Code4rena, SCV)**, embedded using `BAAI/bge-small-en-v1.5`.
2. **Person B (API, Code Preparation & Reasoning):** A FastAPI service that cleans and chunks Solidity files, queries the vector store for similar past exploits, invokes LLM reasoning (**Google Gemini 3.5 Flash** or **Anthropic Claude**) to generate precise vulnerability hypotheses, validates the line numbers/findings, and stores the results in PostgreSQL.

---

## 🏗️ Architecture Flow

```text
                           [ Client / Gateway / Swagger UI ]
                                          │
                               POST /rag/analyses
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FastAPI Application (Port 8002)                                       │
│                                                                        │
│  1. Receives Request ──► Creates record (status: "queued") in DB       │
│     (Idempotent: If audit_id exists, immediately returns existing)    │
│  2. Background Worker:                                                 │
│     ├── Code Prep: Loads .sol files, cleans comments, parses AST       │
│     │              and chunks long contracts.                          │
│     ├── Vector Retrieval: Queries Postgres pgvector (`knowledge` schema)│
│     │                     for similar known hacks/vulnerabilities.     │
│     ├── LLM Reasoning: Gemini/Claude analyzes code + retrieved incidents│
│     ├── Validator: Verifies line numbers and drops hallucinations.     │
│     └── DB Save: Stores hypotheses (status: "completed").              │
└────────────────────────────────────────────────────────────────────────┘
                                          │
                               GET /rag/analyses/{id}
                                          │
                                          ▼
                      [ Full Audit Findings & Hypotheses ]
```

---

## 🚀 Quick Start (Docker Deployment)

Running the entire service with the pre-loaded knowledge base takes **less than 2 minutes**.

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- Set your LLM API Key in `.env` (or `env/api.env.example`):
  ```env
  LLM_PROVIDER=gemini
  GEMINI_API_KEY=your_gemini_api_key_here
  GEMINI_MODEL=gemini-3.5-flash-lite
  ```

### 2. Start the Services
Run the following from the `services/rag-llm-service` directory:

```bash
docker compose up -d
```
This automatically starts:
- **`alpa_rag_postgres`** (PostgreSQL 16 with `pgvector` extension on port `5434`)
- **`alpa_rag_llm_service`** (FastAPI service with PyTorch & BAAI embedding model pre-cached on port `8002`)

### 3. Restore the Knowledge Base (Run Once)
The repository includes `knowledge.dump` containing all 9,948 pre-embedded vector chunks. Restore it into Postgres in one command:

```powershell
# PowerShell:
docker cp knowledge.dump alpa_rag_postgres:/tmp/
docker exec alpa_rag_postgres pg_restore --no-owner -U postgres -d rag_db /tmp/knowledge.dump
```
*(Note: Any warning stating that the "knowledge schema already exists" is completely harmless).*

---

## 🌐 Verification & Interactive Swagger UI

FastAPI provides an automatic, interactive **Swagger UI** for testing all endpoints directly in your browser.

| Feature | URL | Description |
| :--- | :--- | :--- |
| **Interactive Docs (Swagger UI)** | [http://localhost:8002/docs](http://localhost:8002/docs) | Interactive testing console for all endpoints |
| **Health Check** | [http://localhost:8002/health](http://localhost:8002/health) | Returns `{"status":"ok","service":"rag-llm-service","retriever":"real"}` |
| **OpenAPI Specification** | [http://localhost:8002/openapi.json](http://localhost:8002/openapi.json) | Raw OpenAPI JSON schema |
| **ReDoc Alternative UI** | [http://localhost:8002/redoc](http://localhost:8002/redoc) | Clean documentation view |

---

## 🧪 How to Test and Audit Smart Contracts

You can test smart contract auditing using **two different methods**:
1. Using the built-in **Sample Project** (`sample_project/contracts/LendingPool.sol`).
2. Using **Any Other Custom Smart Contract / Project**.

---

### Method 1: Testing with the Built-in Sample Project

The repository comes with a sample vulnerable lending protocol contract (`sample_project/contracts/LendingPool.sol`) containing real reentrancy and unbacked borrowing flaws.

#### A. Via Swagger UI (Browser)
1. Open [http://localhost:8002/docs](http://localhost:8002/docs) in your browser.
2. Expand **`POST /rag/analyses`**, click **"Try it out"**, enter:
   ```json
   {
     "audit_id": "test-sample-01",
     "project_ref": "/app/sample_project"
   }
   ```
3. Click **"Execute"**. You will receive HTTP `202 Accepted` with `"status": "queued"`.
4. Wait **10–15 seconds** for the AI reasoning and vector search to complete.
5. Expand **`GET /rag/analyses/{audit_id}`**, click **"Try it out"**, enter `test-sample-01` into `audit_id`, and click **"Execute"**.
6. You will receive HTTP `200 OK` with `"status": "completed"` and detailed vulnerability hypotheses!

#### B. Via PowerShell / cURL
```powershell
# 1. Trigger the analysis (POST)
curl.exe -s -X POST http://localhost:8002/rag/analyses -H "Content-Type: application/json" -d '{\"audit_id\": \"test-sample-01\", \"project_ref\": \"/app/sample_project\"}'

# 2. Wait 10-15 seconds, then check the result (GET)
curl.exe -s http://localhost:8002/rag/analyses/test-sample-01
```

---

### Method 2: Testing with Another (Custom) Smart Contract / Project

You can test **any external or custom smart contract** by placing its `.sol` files into a directory and pointing `project_ref` to it.

#### Step 1: Prepare your custom contract folder
Create a folder on your computer (for example `my_custom_project`) and put any `.sol` files into it:
```text
my_custom_project/
└── MyTokenVault.sol
```

#### Step 2: Copy the folder into the running Docker container
Run this command from your terminal:
```powershell
docker cp ./my_custom_project alpa_rag_llm_service:/app/my_custom_project
```

#### Step 3: Trigger the Audit
Submit the audit request pointing `project_ref` to `/app/my_custom_project`:

**Via Swagger UI:**
```json
{
  "audit_id": "my-custom-audit-01",
  "project_ref": "/app/my_custom_project"
}
```

**Via PowerShell / cURL:**
```powershell
curl.exe -s -X POST http://localhost:8002/rag/analyses -H "Content-Type: application/json" -d '{\"audit_id\": \"my-custom-audit-01\", \"project_ref\": \"/app/my_custom_project\"}'
```

#### Step 4: Retrieve Results
```powershell
curl.exe -s http://localhost:8002/rag/analyses/my-custom-audit-01
```

The system will:
1. Scan `/app/my_custom_project` recursively for all `.sol` files.
2. Parse all contracts and functions.
3. Query pgvector for matching past Web3 exploits.
4. Pass the code + retrieved context to Gemini/Claude.
5. Store and return the generated vulnerabilities.

---

### 💡 Live Log Monitoring (Optional)
To watch the LLM reasoning and retrieval logs in real-time as an audit executes:
```powershell
docker logs -f alpa_rag_llm_service
```

---

## 📋 Sample Output Structure

When `GET /rag/analyses/{audit_id}` returns `200 OK`, the response contains:

```json
{
  "audit_id": "test-sample-01",
  "status": "completed",
  "context": {
    "contracts": [
      {
        "name": "LendingPool",
        "file": "contracts/LendingPool.sol",
        "is_proxy": false,
        "implementation": null
      }
    ],
    "constructor_params": {}
  },
  "hypotheses": [
    {
      "id": "h1",
      "title": "Potential Vulnerability",
      "location": {
        "file": "contracts/LendingPool.sol",
        "contract": "LendingPool",
        "function": "withdraw",
        "lines": [25, 35]
      },
      "vuln_class": "reentrancy",
      "reason": "Balances updated after external ETH transfer call.",
      "preconditions": [
        "Attacker contract implements fallback/receive function to recursively call withdraw"
      ],
      "attack_idea": "An attacker can deploy a malicious contract that calls withdraw() repeatedly before balances are updated, draining the pool.",
      "similar_incidents": [],
      "confidence": 0.95,
      "severity": "critical"
    }
  ],
  "error": null
}
```

---

## 🧪 Running Tests

To run the offline unit test suite:

```bash
# Run API and Reasoning test suite (33 tests pass 100%)
pytest tests/api tests/reasoning -q

# Run with verbose output
pytest tests/ -v
```

---

## 📂 Project Directory Structure

```text
rag-llm-service/
├── app/
│   ├── main.py                  # FastAPI server entry point (Swagger UI hosted here)
│   ├── config.py                # Pydantic configuration (Gemini / Claude settings)
│   ├── contracts.py             # Shared Protocol contracts & data shapes
│   ├── schemas.py               # API request/response schemas (OpenAPI models)
│   ├── deps.py                  # Dependency injection (retriever switcher: real vs fake)
│   ├── api/
│   │   └── routes.py            # Endpoints: /health, /rag/analyses
│   ├── code_prep/               # Code loading and AST parsing
│   │   ├── loader.py            # Solidity file discovery & reading
│   │   ├── cleaner.py           # Comment stripper (preserves line indices)
│   │   ├── parser.py            # Contract/function extractor
│   │   └── splitter.py          # Long contract chunker
│   ├── reasoning/               # LLM Reasoning Engine (Gemini & Claude)
│   │   ├── prompt.py            # System & user prompts
│   │   ├── analyzer.py          # RAG context injection, Gemini/Claude caller
│   │   ├── validator.py         # Line-range verifier & hallucination filter
│   │   └── fake_retriever.py    # Fallback mock retriever for offline dev
│   ├── db/                      # PostgreSQL storage
│   │   ├── models.py            # Analyses & Hypotheses SQLAlchemy models
│   │   ├── session.py           # Database connection & session pool
│   │   └── repository.py        # Database CRUD helpers (with idempotency support)
│   └── knowledge/               # Knowledge Base & pgvector (Person A)
│       ├── vector_store.py      # pgvector table connection
│       ├── embedder.py          # BAAI/bge-small-en-v1.5 embeddings
│       ├── retriever.py         # Cosine similarity search logic
│       ├── chunker.py           # Knowledge base text chunker
│       └── loaders.py           # SCV, DeFiHackLabs, Code4rena loaders
├── alembic/                     # Database migrations
│   └── versions/001_init.py     # Creates vector ext, knowledge schema & tables
├── requirements/
│   ├── base.txt                 # Core dependencies (FastAPI, SQLAlchemy, httpx)
│   └── knowledge.txt            # Vector store dependencies (pgvector, transformers)
├── sample_project/              # Built-in test fixture
│   └── contracts/
│       └── LendingPool.sol      # Test smart contract (Reentrancy, Borrow flaws)
├── scripts/
│   └── ingest.py                # Script to re-embed raw datasets from scratch
├── tests/                       # Unit and integration tests
├── Dockerfile                   # Production container definition
├── docker-compose.yml           # Compose stack (pgvector + API)
└── knowledge.dump               # 22.4 MB binary backup containing 9,948 vectors
```

---

## ⚙️ Environment Configuration

| Variable | Default (Docker) | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@rag_postgres:5432/rag_db` | Connection for analyses & hypotheses tables (`public` schema) |
| `KNOWLEDGE_DATABASE_URL` | `postgresql+psycopg://postgres:postgres@rag_postgres:5432/rag_db` | Connection for vector search (`knowledge` schema) |
| `RETRIEVER` | `real` | Set to `real` for pgvector retrieval, or `fake` for offline unit tests |
| `LLM_PROVIDER` | `gemini` | LLM provider: `gemini` or `claude` |
| `GEMINI_API_KEY` | *(Set in .env)* | Google Gemini API access key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Google Gemini model name |
| `ANTHROPIC_API_KEY` | *(Set in .env)* | Anthropic Claude API access key (when `LLM_PROVIDER=claude`) |
| `CLAUDE_MODEL` | `claude-3-5-sonnet-20241022` | Anthropic model for reasoning |
