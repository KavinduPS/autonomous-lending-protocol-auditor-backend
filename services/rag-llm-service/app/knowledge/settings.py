from pydantic_settings import BaseSettings, SettingsConfigDict


class KnowledgeSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="KNOWLEDGE_", env_file=".env", extra="ignore"
    )

    database_url: str = ""
    schema_name: str = "knowledge"
    table_name: str = "security_knowledge"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    scv_dataset: str = ""
    code4rena_dataset: str = ""
    defihacklabs_dataset: str = ""
    code4rena_max_rows: int = 3000


settings = KnowledgeSettings()
