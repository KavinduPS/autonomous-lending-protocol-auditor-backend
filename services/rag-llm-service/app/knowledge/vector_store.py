import re
from functools import lru_cache

from langchain_postgres import Column, PGEngine, PGVectorStore
from sqlalchemy import create_engine, text

from app.knowledge.embedder import embedding_dimension, get_embeddings
from app.knowledge.settings import settings

METADATA_FIELDS = {
    "source": "TEXT",
    "source_id": "TEXT",
    "title": "TEXT",
    "vuln_class": "TEXT",
    "severity": "TEXT",
    "incident_name": "TEXT",
    "chunk_index": "INTEGER",
}


def table_name() -> str:
    tag = re.sub(r"[^a-z0-9]+", "_", settings.embedding_model.lower()).strip("_")
    name = f"{settings.table_name}_{tag}"
    if len(name) > 63:
        raise ValueError(f"Table name too long for Postgres: {name}")
    return name


def _database_url() -> str:
    if not settings.database_url:
        raise RuntimeError("KNOWLEDGE_DATABASE_URL is not set")
    return settings.database_url


@lru_cache(maxsize=1)
def get_engine() -> PGEngine:
    return PGEngine.from_connection_string(url=_database_url())


def table_exists() -> bool:
    query = text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = :schema AND table_name = :table"
    )
    engine = create_engine(_database_url())
    try:
        with engine.connect() as connection:
            params = {"schema": settings.schema_name, "table": table_name()}
            return connection.execute(query, params).first() is not None
    finally:
        engine.dispose()


def ensure_table() -> None:
    if table_exists():
        return
    get_engine().init_vectorstore_table(
        table_name=table_name(),
        vector_size=embedding_dimension(),
        schema_name=settings.schema_name,
        metadata_columns=[Column(name, kind) for name, kind in METADATA_FIELDS.items()],
    )


@lru_cache(maxsize=1)
def get_store() -> PGVectorStore:
    return PGVectorStore.create_sync(
        engine=get_engine(),
        table_name=table_name(),
        schema_name=settings.schema_name,
        embedding_service=get_embeddings(),
        metadata_columns=list(METADATA_FIELDS),
    )
