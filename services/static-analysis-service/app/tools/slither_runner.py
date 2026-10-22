import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from app.core.config import PROJECT_ROOT, get_settings


def run_slither(
    source_path:str,
    detector:str | None = None,
    timeout_seconds: int | None = None,
)-> dict:
    settings = get_settings()
    if timeout_seconds is None:
        timeout_seconds = settings.analysis_timeout_seconds
    source = (PROJECT_ROOT / source_path).resolve()
    
    if not source.is_file() or source.suffix.lower() != ".sol":
        raise ValueError("Provide an existing Solidity file.")
    
    bin_directory = Path(sys.executable).parent
    extension = ".exe" if os.name == "nt" else ""
    
    slither = bin_directory / f"slither{extension}"
    solc = bin_directory / f"solc{extension}"
    
    if not slither.is_file() or not solc.is_file():
        raise RuntimeError(
          "Slither and solc must be installed in this environment."
        )
        
    with tempfile.TemporaryDirectory(prefix="slither-") as directory:
        output_path = Path(directory) / "result.json"

        command = [
            str(slither),
            str(source),
            "--solc",
            str(solc),
            "--json",
            str(output_path),
        ]

        if detector:
            command.extend(["--detect", detector])

        try:
            process = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                env=settings.compiler_environment(),
                shell=False,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Slither analysis timed out.") from exc

        # Findings can produce a nonzero exit code.
        # Inspect Slither's JSON instead of rejecting that code alone.
        if not output_path.is_file():
            details = process.stderr.strip() or process.stdout.strip()
            raise RuntimeError(
                f"Slither did not produce JSON output: {details}"
            )

        try:
            result = json.loads(
                output_path.read_text(encoding="utf-8")
            )
        except json.JSONDecodeError as exc:
            raise RuntimeError("Slither produced invalid JSON.") from exc

        if result.get("success") is not True:
            raise RuntimeError(
                result.get("error") or "Slither analysis failed."
            )

        return result
