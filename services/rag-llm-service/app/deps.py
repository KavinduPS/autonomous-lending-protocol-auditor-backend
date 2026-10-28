from app.config import settings
from app.contracts import Retriever
from app.reasoning.fake_retriever import FakeRetriever


def get_retriever() -> Retriever:
    """Provides the active retriever implementation based on the RETRIEVER environment setting."""
    if settings.retriever.lower() == "real":
        from app.knowledge.retriever import get_retriever as get_real_retriever

        return get_real_retriever()

    return FakeRetriever()
