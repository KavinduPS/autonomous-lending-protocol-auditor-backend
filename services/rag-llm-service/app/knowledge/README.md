# RAG LLM Service: Knowledge Base and Hypotheses

Part of the smart contract audit platform. This page explains what the service does, what data it uses, how that data is stored, and how its output is used by the other services.

Last updated: 27 Oct 2026.

## 1. What this service does

Given a Solidity project, the service answers one question: **where might this code be vulnerable, and what past bugs does it resemble?**

It does this in three moves:

1. It keeps a **library of known bugs and real hacks** (the knowledge base).
2. For each piece of submitted code, it **looks up the most similar entries** in that library.
3. It asks Claude to write a short list of **hypotheses**: suspected bugs, with the exact file, function and lines, a short reason, an attack idea, and a confidence score.

The service does not prove anything and does not write exploit code. Its output is a list of leads. Another service (EPA) tries to turn those leads into proven exploits.

## 2. Status

| Part                                                 | Owner          | Status                     |
| ---------------------------------------------------- | -------------- | -------------------------- |
| Dataset loaders (3 sources), chunker, label mapping  | Knowledge base | Done and tested            |
| Embedder and vector store (Postgres with pgvector)   | Knowledge base | Done and tested            |
| `scripts/ingest.py` (fills the library)              | Knowledge base | Done. 9,948 pieces loaded  |
| `retrieve()` (the search function)                   | Knowledge base | Done and tested (41 tests) |
| API, results database, code preparation, Claude step | API side       | In progress                |

## 3. Inputs and outputs

### Input

`POST /rag/analyses`

```json
{
  "audit_id": "uuid",
  "project_ref": "path to the extracted project",
  "chain": "ethereum",
  "contract_address": "0x...",
  "block_number": 12345678
}
```

`chain`, `contract_address` and `block_number` are optional. The service works from the code alone.

### Output

`GET /rag/analyses/{audit_id}` returns the status, and the result once it is done:

```json
{
  "audit_id": "uuid",
  "status": "completed",
  "context": {
    "contracts": [
      {
        "name": "LendingPool",
        "file": "src/LendingPool.sol",
        "is_proxy": false,
        "implementation": null
      }
    ],
    "constructor_params": {}
  },
  "hypotheses": [
    {
      "id": "h1",
      "title": "Spot price oracle can be manipulated",
      "location": {
        "file": "src/LendingPool.sol",
        "contract": "LendingPool",
        "function": "borrow",
        "lines": [112, 140]
      },
      "vuln_class": "price_manipulation",
      "reason": "Collateral value is read from one DEX pool in the same transaction.",
      "preconditions": ["needs flash loan", "pool has low liquidity"],
      "attack_idea": "Skew the pool price, borrow against inflated collateral, repay.",
      "similar_incidents": [
        {
          "source": "defihacklabs",
          "name": "Cream Finance 2021",
          "score": 0.82
        }
      ],
      "confidence": 0.78,
      "severity": "high"
    }
  ]
}
```

The exact shape is fixed in `docs/sample_output.json`. Other services can build against it today.

## 4. How the service works

```
  Caller (execution service or gateway)
         |  POST /rag/analyses
         v
  +--------------------+        +------------------------------+
  | API                |------->| Results database             |
  | (FastAPI)          |<-------| rag_db, schema public        |
  +---------+----------+        | analyses, hypotheses         |
            |                   +------------------------------+
            v
  +--------------------+
  | Code preparation   |   find .sol files, remove comments,
  +---------+----------+   list contracts and functions
            |  code of one function
            v
  +--------------------+        +------------------------------+
  | Retriever          |<------>| Knowledge base               |
  | retrieve()         |        | rag_db, schema knowledge     |
  +---------+----------+        | thousands of known bugs      |
            |  similar known bugs
            v
  +--------------------+
  | Claude reasoning   |   writes hypotheses
  +---------+----------+
            v
  +--------------------+
  | Validator          |   drops hypotheses that point to code that does not exist
  +---------+----------+
            v
  Saved in the results database. Returned by GET /rag/analyses/{audit_id}
```

The library is filled once, before any request arrives:

```
  SCV dataset ------------\
  DeFiHackLabs dataset ----+--> loaders --> chunker --> embedder --> knowledge table
  Code4rena findings ------/    clean and   cut long    text becomes
                                label       text        384 numbers
```

Both the results and the library live in one database (`rag_db`), in two separate schemas, so the service is deployed with a single database.

## 5. The data: what is in the library

| Source                                         | What it is                                                                                            | Size used                                                                                   | Notes                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **SCV** (Smart Contract Vulnerability dataset) | Short vulnerable Solidity functions with a category, a description, an example exploit and a severity | 730 distinct entries (about 2,000 rows, 2 broken lines skipped, the rest are mostly copies) | Teaching style examples, older Solidity. About 15 categories such as reentrancy, access control, front-running            |
| **DeFiHackLabs**                               | Real DeFi hacks, for example Bancor 2020, with an analysis of what went wrong and the attack steps    | 241 incidents                                                                               | The analysis text was written by a small AI model, so treat it as a hint, not a fact                                      |
| **Code4rena findings**                         | Real audit findings written by human auditors in public audit contests                                | 3,000 findings, randomly sampled from 4,400 (medium and high severity only)                 | Each report is trimmed to its first 3,000 characters, and web links are removed. The source file is not in the repository |

What is left out on purpose:

- SCV: CVE numbers and source links, because some of them look unreliable.
- DeFiHackLabs: the long exploit test code, which would bury the explanation.
- Rows marked as not vulnerable and empty rows are skipped and counted.
- Entries with identical text are stored once. SCV has about 2,000 rows but only 730 distinct texts, so most rows were copies of the same example.

Library size after cutting long entries into pieces:

| Source       | Pieces    |
| ------------ | --------- |
| SCV          | 730       |
| DeFiHackLabs | 858       |
| Code4rena    | 8,360     |
| **Total**    | **9,948** |

## 6. How a record is stored

Each entry is cut into pieces if it is long, and every piece becomes one database row. A row has the text, the text as 384 numbers (used for searching), and these labels:

| Column          | Meaning                               | Example                            |
| --------------- | ------------------------------------- | ---------------------------------- |
| `source`        | Which dataset                         | `scv`, `defihacklabs`, `code4rena` |
| `source_id`     | The entry's ID in its dataset         | `SCV-001`                          |
| `title`         | A readable name                       | `Bancor (2020-06)`                 |
| `vuln_class`    | One of 8 shared types                 | `access_control`                   |
| `severity`      | If the dataset has it                 | `critical`                         |
| `incident_name` | Real incident name, DeFiHackLabs only | `Bancor`                           |
| `chunk_index`   | Which piece of a long entry           | `0`                                |

The 8 shared types are: `reentrancy`, `access_control`, `price_manipulation`, `oracle`, `flash_loan`, `integer_overflow`, `logic_error`, `other`.

The internal columns for the id, text and numbers are named by the LangChain library.

The table is called `security_knowledge_<model name>`, for example `security_knowledge_baai_bge_small_en_v1_5`. Numbers from different embedding models cannot be compared, so each model gets its own table.

### Sample rows

**From SCV**

```
source:     scv
source_id:  SCV-001
title:      SCV-001: Reentrancy
vuln_class: reentrancy
severity:   critical
text:
  Vulnerability: Reentrancy
  Description: The withdraw function sends Ether before updating the balance,
  allowing an attacker to re-enter the function and drain funds.
  Vulnerable code:
  function withdraw() public { require(balances[msg.sender] > 0); ... }
  Example exploit:
  contract Attack { function attack(address target) public { ... } }
```

**From DeFiHackLabs**

```
source:        defihacklabs
source_id:     2020_06_bancor
title:         Bancor (2020-06)
incident_name: Bancor
vuln_class:    access_control
text:
  Incident: Bancor (2020-06)
  Vulnerability type: Access Control
  Root cause: The `safeTransferFrom` function within the `BancorNetwork`
  contract was unintentionally exposed as public ...
  What happened: The attacker exploited a vulnerability in Bancor's ...
  Attack steps:
  1. The attacker identified that the contract had a publicly accessible function.
  2. The attacker checked if any user had granted an allowance ...
```

**From Code4rena**

```
source:     code4rena
source_id:  2022-09-nouns-builder/m_18
title:      2022-09-nouns-builder: Precision is not enough for `proposalThreshold` and quorum ...
vuln_class: other
severity:   medium
text:
  Code4rena finding (2022-09-nouns-builder, medium severity)
  Title: Precision is not enough for `proposalThreshold` and quorum ...
  Governor.sol#L465-L477
  Precision is not enough for proposalThreshold and quorum. Collections with
  at least 20000 NFTs in total supply may have some trouble ...
```

## 7. How search works

`retrieve(query, top_k=5, vuln_class=None, source=None)` is the one function the rest of the service calls.

1. The query (usually the code of one function) is turned into 384 numbers by the same model.
2. The database finds the rows whose numbers are closest. It can be limited to one `vuln_class` or one `source`.
3. Duplicates are removed. An entry appears once, even if several of its pieces matched, and identical texts appear once.
4. At most 3 results come from one source, so one big source (Code4rena is 84% of the pieces) cannot fill the whole list. This cap is off when you filter by `source`.
5. The database gives a distance, where 0 is a perfect match. The function converts it to a score where higher is better (`1 - distance`).

It returns a list of `RetrievedChunk`:

```json
{
  "text": "Incident: Bancor (2020-06) ...",
  "source": "defihacklabs",
  "title": "Bancor (2020-06)",
  "vuln_class": "access_control",
  "incident_name": "Bancor",
  "score": 0.82
}
```

(Example values. The shape is defined in `app/contracts.py`.)

### Search tips

- **Describe, then paste.** The embedding model is a general English model, so plain sentences work better than raw code. Search with one or two sentences that say what the function does and what could go wrong, plus the code.
- **Scores only order the results.** They sit in a narrow band (about 0.75 to 0.85), so 0.8 does not mean 80% sure. Do not set a cut off on the score.
- **Filter when you know the type.** The `vuln_class` and `source` filters narrow the search.

## 8. How the output is used by the other services

```
  Static analysis ---------\   findings with file, function, lines
                            \
                             +--> Gate and brief builder --> EPA --> exploit code --> Sandbox run
                            /     (execution service)        plan                      result
  RAG service -------------/   hypotheses with file, function, lines
```

- **Static analysis** is precise but narrow. It spots known code patterns, and it cannot see economic or cross contract logic.
- **This service** is broader. It suggests economic and contextual risks, but it is an AI suggestion and has not been checked.
- **The gate** matches both lists by location (file and function). Items that both flag go first, and each side's unique items stay in. It drops the weak ones using confidence and severity, and builds one brief.
- **EPA** takes that brief, plans the attack step by step, writes the exploit, runs it on a forked chain, reads the result (profit, traces, errors), and retries a few times. A hypothesis only becomes a confirmed finding if the exploit actually works.

The gate and EPA are separate services. This service only produces the hypotheses.

## 9. Run it locally

```
# 1. start a Postgres with pgvector and create the schema (once)
docker run --name rag-pgvector -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rag_db -p 5435:5432 -d pgvector/pgvector:pg16
docker exec rag-pgvector psql -U postgres -d rag_db -c "CREATE EXTENSION IF NOT EXISTS vector;" -c "CREATE SCHEMA IF NOT EXISTS knowledge;"

# 2. settings in .env (never commit this file)
KNOWLEDGE_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5435/rag_db

# 3. put the Code4rena export at data/code4rena_findings.jsonl (not in the repo)

# 4. fill the library (several minutes, keep a few GB of disk free) and run the tests
source .venv/bin/activate
python -m scripts.ingest
python -m pytest tests/knowledge -q --deselect tests/knowledge/test_embedder.py

# the live search tests skip themselves if the database is not running
```

Look inside the library:

```
docker exec rag-pgvector psql -U postgres -d rag_db -c "SELECT source, vuln_class, count(*) FROM knowledge.security_knowledge_baai_bge_small_en_v1_5 GROUP BY 1, 2 ORDER BY 1, 3 DESC;"
```

All settings are listed in `env/knowledge.env.example`.

### Restore the library from a dump (no datasets needed)

If a teammate gives you `knowledge.dump`, you can skip the datasets and the ingestion run. The database must use the `pgvector/pgvector` image, because a plain Postgres image cannot hold the vectors.

```
CONTAINER=alpa_rag_postgres        # or rag-pgvector
docker cp knowledge.dump $CONTAINER:/tmp/knowledge.dump
docker exec $CONTAINER psql -U postgres -d rag_db -c "CREATE EXTENSION IF NOT EXISTS vector;" -c "CREATE SCHEMA IF NOT EXISTS knowledge;"
docker exec $CONTAINER pg_restore --no-owner -U postgres -d rag_db /tmp/knowledge.dump
```

A warning that the schema already exists is harmless. Never commit the dump file.

### Using the retriever from the API side

```python
from app.knowledge.retriever import get_retriever

retriever = get_retriever()
chunks = retriever.retrieve("what the function does and what could go wrong, plus its code", top_k=5)
```

Settings it needs:

- `RETRIEVER=real` (the API switches from the fake retriever to this one)
- `KNOWLEDGE_DATABASE_URL` pointing at `rag_db` (inside Docker: `postgresql+psycopg://postgres:postgres@rag_postgres:5432/rag_db`)
- `KNOWLEDGE_EMBEDDING_MODEL` must match the model the library was built with (`BAAI/bge-small-en-v1.5`). The table name contains the model name, so a different value looks at a table that does not exist. If the Docker image bakes the model in at build time, use the same value as the build argument.

## 10. Files in `app/knowledge`

| File              | Job                                                                          |
| ----------------- | ---------------------------------------------------------------------------- |
| `settings.py`     | All settings, read from environment variables starting with `KNOWLEDGE_`     |
| `models.py`       | `KnowledgeChunk`: the one standard shape every dataset row is converted into |
| `labels.py`       | Turns a dataset's own category name into one of the 8 shared types           |
| `loaders.py`      | One reader per dataset                                                       |
| `chunker.py`      | Cuts long text into pieces the model can read                                |
| `embedder.py`     | Loads the embedding model once and turns text into numbers                   |
| `vector_store.py` | Creates the table and talks to Postgres                                      |
| `retriever.py`    | `get_retriever()` and the `retrieve()` search function                       |

Also: `scripts/ingest.py` fills the library, and `tests/knowledge/` holds the tests.

## 11. Limits to know

- **Retrieval quality is only spot checked.** Searches with plain sentences return sensible results, but it is not yet measured on contracts with known bugs.
- **Raw code queries match weakly.** The embedding model is a general English one. A code aware model would help, and the table is built so the model can be swapped.
- **Scores only order the results.** They sit in a narrow band (about 0.75 to 0.85), so they are not probabilities.
- **SCV entries are short teaching examples,** and there are only 730 distinct ones. The incidents and the audit findings carry more weight for real lending protocols.
- **DeFiHackLabs labels were written by an AI model** and can be wrong. Use them as a rough filter.
- **About half of the entries are labelled `other`.** The type comes from simple keyword rules. Search by meaning still works, but filtering by type misses these entries.
- **The list of 8 types is short** and is shared with the other service, so changing it needs both sides to agree.
- **Changing the embedding model means a new table and a new ingestion run.**
- **Dataset licences:** check them before sharing the data or the Code4rena export outside the project.
- **Searching with raw code matches weakly** because the embedding model is a general English one. A code aware model would help, and the table is built so it can be swapped.
- **Scores only order the results.** They sit in a narrow band (about 0.75 to 0.85), so don’t read 0.8 as 80% sure.
