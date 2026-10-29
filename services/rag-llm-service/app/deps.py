from app.contracts import Retriever


def get_retriever() -> Retriever:
    """Provides the active retriever implementation using the pgvector knowledge base."""
    from app.knowledge.retriever import get_retriever as get_real_retriever

    return get_real_retriever()
