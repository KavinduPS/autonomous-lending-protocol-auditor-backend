import json
import os
import subprocess
import sys
from pathlib import Path
from app.core.config import get_settings


def validate_compilation(source_code: str, timeout_seconds: int | None = None) -> None:
    settings = get_settings()
    if timeout_seconds is None:
        timeout_seconds = settings.compilation_timeout_seconds
    extension = ".exe" if os.name == "nt" else ""
    solc = Path(sys.executable).parent / f"solc{extension}"

    if not solc.is_file():
        raise RuntimeError("Solidity compiler is not installed.")

    compiler_input = {
        "language": "Solidity",
        "sources": {"Contract.sol": {"content": source_code}},
        "settings": {
            "outputSelection": {"*": {"*": ["evm.bytecode.object"]}}
        },
    }

    try:
        process = subprocess.run(
            [str(solc), "--standard-json", "--no-import-callback"],
            input=json.dumps(compiler_input),
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
        raise TimeoutError("Solidity compilation timed out.") from exc
    except OSError as exc:
        raise RuntimeError("Could not start the Solidity compiler.") from exc

    if process.returncode != 0:
        raise RuntimeError("Solidity compiler execution failed.")

    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Compiler returned invalid JSON.") from exc

    errors = [
        item for item in result.get("errors", [])
        if item.get("severity") == "error"
    ]

    if any(item.get("type") in {"InternalCompilerError", "Exception"}
           for item in errors):
        raise RuntimeError("The Solidity compiler encountered an internal error.")

    if errors:
        messages = "\n".join(
            item.get("formattedMessage") or item.get("message", "Compile error")
            for item in errors
        )
        raise ValueError(f"Solidity compilation failed:\n{messages}")
