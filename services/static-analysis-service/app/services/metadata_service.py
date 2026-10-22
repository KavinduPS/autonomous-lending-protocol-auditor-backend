import hashlib
import os
import re
import subprocess
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from app.schemas.analysis import AnalysisMetadata
from app.core.config import get_settings


def build_analysis_metadata(source_code: str) -> AnalysisMetadata:
    settings = get_settings()
    extension = ".exe" if os.name == "nt" else ""
    solc = Path(sys.executable).parent / f"solc{extension}"

    try:
        process = subprocess.run(
            [str(solc), "--version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=min(10, settings.compilation_timeout_seconds),
            env=settings.compiler_environment(),
            shell=False,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("Compiler version check timed out.") from exc
    except OSError as exc:
        raise RuntimeError("Could not start the Solidity compiler.") from exc

    match = re.search(r"Version:\s*(\S+)", process.stdout)
    if process.returncode != 0 or match is None:
        raise RuntimeError("Could not determine the Solidity compiler version.")

    try:
        slither_version = version("slither-analyzer")
    except PackageNotFoundError as exc:
        raise RuntimeError("Slither package metadata is unavailable.") from exc

    return AnalysisMetadata(
        source_sha256=hashlib.sha256(source_code.encode("utf-8")).hexdigest(),
        slither_version=slither_version,
        compiler_version=match.group(1),
    )
