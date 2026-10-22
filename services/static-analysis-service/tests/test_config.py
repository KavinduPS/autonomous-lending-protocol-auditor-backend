import pytest
from pydantic import ValidationError

from app.core.config import PROJECT_ROOT, get_settings
from app.schemas.analysis import AnalysisRequest


VARIABLES = (
    "STATIC_ANALYSIS_TIMEOUT_SECONDS",
    "STATIC_COMPILATION_TIMEOUT_SECONDS",
    "STATIC_ANALYSIS_MAX_SOURCE_BYTES",
    "STATIC_ANALYSIS_WORKSPACE_DIR",
    "SOLC_VERSION",
)


@pytest.fixture(autouse=True)
def isolated_configuration(monkeypatch):
    for variable in VARIABLES:
        monkeypatch.delenv(variable, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_configuration_defaults():
    settings = get_settings()
    assert settings.analysis_timeout_seconds == 60
    assert settings.compilation_timeout_seconds == 30
    assert settings.max_source_bytes == 200_000
    assert settings.workspace_directory == (PROJECT_ROOT / "workspaces").resolve()
    assert settings.solc_version == "0.8.24"


def test_environment_overrides(monkeypatch):
    monkeypatch.setenv("STATIC_ANALYSIS_TIMEOUT_SECONDS", "120")
    monkeypatch.setenv("STATIC_COMPILATION_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("STATIC_ANALYSIS_MAX_SOURCE_BYTES", "1000")
    monkeypatch.setenv("STATIC_ANALYSIS_WORKSPACE_DIR", "custom-workspaces")
    settings = get_settings()
    assert settings.analysis_timeout_seconds == 120
    assert settings.compilation_timeout_seconds == 45
    assert settings.max_source_bytes == 1000
    assert settings.workspace_directory == (PROJECT_ROOT / "custom-workspaces").resolve()


@pytest.mark.parametrize("variable,value", [
    ("STATIC_ANALYSIS_TIMEOUT_SECONDS", "0"),
    ("STATIC_COMPILATION_TIMEOUT_SECONDS", "-1"),
    ("STATIC_ANALYSIS_MAX_SOURCE_BYTES", "invalid"),
    ("STATIC_ANALYSIS_WORKSPACE_DIR", ""),
    ("SOLC_VERSION", "0.8.25"),
])
def test_invalid_configuration_is_rejected(monkeypatch, variable, value):
    monkeypatch.setenv(variable, value)
    with pytest.raises(RuntimeError):
        get_settings()


def test_source_limit_counts_utf8_bytes(monkeypatch):
    monkeypatch.setenv("STATIC_ANALYSIS_MAX_SOURCE_BYTES", "3")
    assert AnalysisRequest(audit_id="bytes", source_code="abc").source_code == "abc"
    with pytest.raises(ValidationError, match="3-byte limit"):
        AnalysisRequest(audit_id="bytes", source_code="\u00e9\u00e9")


def test_blank_source_is_rejected():
    with pytest.raises(ValidationError, match="cannot be blank"):
        AnalysisRequest(audit_id="blank", source_code=" \n\t ")


def test_compiler_environment_preserves_other_settings(monkeypatch):
    monkeypatch.setenv("STATIC_ANALYSIS_TEST_MARKER", "preserved")
    environment = get_settings().compiler_environment()
    assert environment["SOLC_VERSION"] == "0.8.24"
    assert environment["STATIC_ANALYSIS_TEST_MARKER"] == "preserved"
