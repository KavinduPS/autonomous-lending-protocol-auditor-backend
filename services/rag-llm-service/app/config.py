from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8002
    host: str = "0.0.0.0"
    environment: str = "development"

    # Database
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5434/rag_db"

    # Claude Settings
    anthropic_api_key: str = ""
    claude_model: str = "claude-3-5-sonnet-20241022"

    # Retriever switch: "fake" or "real"
    retriever: str = "fake"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
