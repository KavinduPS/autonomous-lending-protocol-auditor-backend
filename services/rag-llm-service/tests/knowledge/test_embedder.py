from app.knowledge.embedder import embedding_dimension, get_embeddings


def test_embedding_length_matches_dimension() -> None:
    vector = get_embeddings().embed_query("reentrancy")
    assert len(vector) == embedding_dimension()
    assert len(vector) > 0
