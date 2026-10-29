"""Shared pytest fixtures for all test modules."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.contracts import RetrievedChunk, Retriever
from app.db.models import Base
from app.db.session import get_db
from app.main import app

SQLITE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class FakeRetriever:
    """Mock retriever used exclusively in isolated unit tests."""

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


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    """Yield a fresh test DB session."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    """FastAPI test client wired to the in-memory test DB."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()
