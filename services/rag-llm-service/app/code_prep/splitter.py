import logging
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

SOL_CHUNK_SIZE = 6000
SOL_CHUNK_OVERLAP = 200


def split_contract(file_path: str, cleaned_source: str) -> list[dict]:
    """Split a Solidity source into chunks if it is too long for a single prompt.

    Each chunk keeps the file path metadata so the analyzer can reference locations.
    Returns a list of dicts: {path, content, chunk_index}.
    If the source fits in one chunk, returns a single-element list.
    """
    splitter = RecursiveCharacterTextSplitter.from_language(
        language=Language.SOL,
        chunk_size=SOL_CHUNK_SIZE,
        chunk_overlap=SOL_CHUNK_OVERLAP,
    )

    chunks = splitter.split_text(cleaned_source)

    if len(chunks) == 1:
        logger.debug("%s fits in one chunk (%d chars)", file_path, len(cleaned_source))
    else:
        logger.info(
            "%s split into %d chunks (total %d chars)",
            file_path,
            len(chunks),
            len(cleaned_source),
        )

    return [
        {"path": file_path, "content": chunk, "chunk_index": i}
        for i, chunk in enumerate(chunks)
    ]
