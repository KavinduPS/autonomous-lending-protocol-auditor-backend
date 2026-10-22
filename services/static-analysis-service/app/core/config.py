import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    analysis_timeout_seconds: int
    compilation_timeout_seconds: int
    max_source_bytes: int
    workspace_directory: Path
    solc_version: str

    def compiler_environment(self) -> dict[str, str]:
        return {**os.environ, "SOLC_VERSION": self.solc_version}


def _positive_integer(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive integer.") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be a positive integer.")
    return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    compiler = os.environ.get("SOLC_VERSION", "0.8.24").strip()
    if compiler != "0.8.24":
        raise RuntimeError("This prototype currently supports SOLC_VERSION=0.8.24 only.")

    workspace = os.environ.get("STATIC_ANALYSIS_WORKSPACE_DIR", "workspaces").strip()
    if not workspace:
        raise RuntimeError("STATIC_ANALYSIS_WORKSPACE_DIR cannot be empty.")

    return Settings(
        analysis_timeout_seconds=_positive_integer("STATIC_ANALYSIS_TIMEOUT_SECONDS", 60),
        compilation_timeout_seconds=_positive_integer("STATIC_COMPILATION_TIMEOUT_SECONDS", 30),
        max_source_bytes=_positive_integer("STATIC_ANALYSIS_MAX_SOURCE_BYTES", 200_000),
        workspace_directory=(PROJECT_ROOT / workspace).resolve(),
        solc_version=compiler,
    )
