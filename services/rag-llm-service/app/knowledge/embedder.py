from functools import lru_cache

from langchain_huggingface import HuggingFaceEmbeddings

from app.knowledge.settings import settings


@lru_cache(maxsize=1)
def get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model,
        encode_kwargs={"normalize_embeddings": True},
    )


@lru_cache(maxsize=1)
def embedding_dimension() -> int:
    return len(get_embeddings().embed_query("dimension check"))
