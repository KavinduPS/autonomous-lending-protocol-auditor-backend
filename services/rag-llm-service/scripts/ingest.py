import uuid
from collections.abc import Iterable, Iterator

from langchain_core.documents import Document
from sqlalchemy import create_engine, text

from app.knowledge.chunker import split_chunk
from app.knowledge.loaders import (
    LoadStats,
    load_code4rena,
    load_defihacklabs,
    load_scv,
)
from app.knowledge.models import KnowledgeChunk
from app.knowledge.settings import settings
from app.knowledge.vector_store import ensure_table, get_store, table_name

BATCH_SIZE = 64
ID_NAMESPACE = uuid.UUID("6f1c2a52-3b0e-4f5e-9d2b-0a1f6a9b7c11")


def to_document(chunk: KnowledgeChunk) -> Document:
    metadata = {
        "source": chunk.source,
        "source_id": chunk.source_id,
        "title": chunk.title,
        "vuln_class": chunk.vuln_class,
        "severity": chunk.severity,
        "incident_name": chunk.incident_name,
        "chunk_index": chunk.chunk_index,
    }
    metadata = {key: value for key,
                value in metadata.items() if value is not None}
    key = f"{chunk.source}:{chunk.source_id}:{chunk.chunk_index}"
    return Document(
        id=str(uuid.uuid5(ID_NAMESPACE, key)),
        page_content=chunk.text,
        metadata=metadata,
    )


def pieces(chunks: Iterable[KnowledgeChunk]) -> Iterator[KnowledgeChunk]:
    for chunk in chunks:
        yield from split_chunk(chunk)


def batches(items: Iterable[KnowledgeChunk], size: int) -> Iterator[list[KnowledgeChunk]]:
    batch: list[KnowledgeChunk] = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def unique_by_text(chunks: Iterable[KnowledgeChunk]) -> Iterator[KnowledgeChunk]:
    seen: set[str] = set()
    for chunk in chunks:
        key = " ".join(chunk.text.lower().split())
        if key in seen:
            continue
        seen.add(key)
        yield chunk


def ingest_source(name: str, chunks: Iterable[KnowledgeChunk], store) -> int:
    saved = 0
    for batch in batches(pieces(unique_by_text(chunks)), BATCH_SIZE):
        documents = [to_document(chunk) for chunk in batch]
        ids = [document.id for document in documents]
        store.delete(ids)
        store.add_documents(documents, ids=ids)
        saved += len(documents)
        print(f"  {name}: {saved} pieces saved", end="\r")
    print(f"  {name}: {saved} pieces saved")
    return saved


def counts_by_source() -> dict[str, int]:
    query = text(
        f'SELECT source, count(*) FROM "{settings.schema_name}"."{table_name()}" '
        "GROUP BY source ORDER BY source"
    )
    engine = create_engine(settings.database_url)
    try:
        with engine.connect() as connection:
            return {row[0]: int(row[1]) for row in connection.execute(query)}
    finally:
        engine.dispose()


def main() -> None:
    ensure_table()
    store = get_store()
    sources = [
        ("scv", load_scv),
        ("defihacklabs", load_defihacklabs),
        ("code4rena", load_code4rena),
    ]
    for name, loader in sources:
        print(f"Loading {name} ...")
        stats = LoadStats()
        ingest_source(name, loader(stats), store)
        print(f"  {stats}")
    counts = counts_by_source()
    print("Rows in table by source:", counts)
    print("Total:", sum(counts.values()))


if __name__ == "__main__":
    main()
