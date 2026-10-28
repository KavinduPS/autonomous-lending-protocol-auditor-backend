from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

from app.knowledge.models import KnowledgeChunk

CODE_SOURCES = {"scv"}

_code_splitter = RecursiveCharacterTextSplitter.from_language(
    Language.SOL, chunk_size=1200, chunk_overlap=100
)
_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=100)


def split_chunk(chunk: KnowledgeChunk) -> list[KnowledgeChunk]:
    splitter = _code_splitter if chunk.source in CODE_SOURCES else _text_splitter
    pieces = [piece for piece in splitter.split_text(
        chunk.text) if piece.strip()]
    return [
        chunk.model_copy(update={"text": piece, "chunk_index": index})
        for index, piece in enumerate(pieces)
    ]
