from pydantic_settings import BaseSettings, SettingsConfigDict


class KnowledgeSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="KNOWLEDGE_", env_file=".env", extra="ignore"
    )

    database_url: str = ""
    schema_name: str = "knowledge"
    table_name: str = "security_knowledge"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    scv_dataset: str = "darkknight25/Smart_Contract_Vulnerability_Dataset"
    scv_filename: str = "smartcontract_vuleablities _dataset.jsonl"
    scv_revision: str = "607cb7f0c63c8cc5a00ed494b52b562ac9508517"
    code4rena_path: str = "data/code4rena_findings.jsonl"
    defihacklabs_dataset: str = "akshaynexus/DeFiHackLabs-Dataset"
    defihacklabs_revision: str = "98523cc690ef8517a6232d2787bf95416eb1bb81"
    code4rena_max_rows: int = 3000


settings = KnowledgeSettings()
