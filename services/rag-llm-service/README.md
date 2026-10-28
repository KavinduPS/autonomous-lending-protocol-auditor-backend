# RAG LLM Service

Autonomous vulnerability hypothesis generation service for DeFi lending protocols, part of the Autonomous Lending Protocol Auditor (ALPA).

## Architecture & Work Division
- **Person A**: Knowledge Base & Retrieval (`app/knowledge/`, Qdrant, embeddings, HuggingFace dataset ingest).
- **Person B**: Host API, DB, Code Preparation, Claude Reasoning (`app/api/`, `app/db/`, `app/code_prep/`, `app/reasoning/`).
- **Meeting Point**: `app/contracts.py` defines the frozen `Retriever` protocol. `app/deps.py` returns `FakeRetriever` until `RETRIEVER=real` is configured.

## Quickstart

### 1. Environment Configuration
Copy environment examples:
```bash
cp env/api.env.example .env
```

### 2. Run with Docker Compose
To start Qdrant, PostgreSQL, and the RAG service:
```bash
docker compose up -d --build
```

### 3. Verify Health
```bash
curl http://localhost:8002/health
```

### 4. Code Formatting & Tests
```bash
ruff format
pytest
```
