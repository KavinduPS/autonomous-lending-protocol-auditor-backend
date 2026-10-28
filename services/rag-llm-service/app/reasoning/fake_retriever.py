from app.contracts import RetrievedChunk, Retriever


class FakeRetriever:
    """Stand-in retriever for development and testing until Person A finishes the real pgvector retriever."""

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        vuln_class: str | None = None,
        source: str | None = None,
    ) -> list[RetrievedChunk]:
        return [
            RetrievedChunk(
                text="Cream Finance price calculation vulnerability: oracle reads spot price directly from Uniswap pool without TWAP protection.",
                source="defihacklabs",
                title="Cream Finance Oracle Manipulation",
                vuln_class="price_manipulation",
                incident_name="Cream Finance 2021",
                score=0.92,
            ),
            RetrievedChunk(
                text="Reentrancy in withdraw function allowing state updates after token transfer.",
                source="code4rena",
                title="Cross-function Reentrancy in Lending Pool",
                vuln_class="reentrancy",
                incident_name=None,
                score=0.85,
            ),
        ][:top_k]
