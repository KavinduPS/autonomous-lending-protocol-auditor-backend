from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8002
    host: str = "0.0.0.0"
    environment: str = "development"

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5434/rag_db"

    anthropic_api_key: str = ""
    claude_model: str = "claude-3-5-sonnet-20241022"
    llm_provider: str = "claude"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    retriever: str = "real"
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()
