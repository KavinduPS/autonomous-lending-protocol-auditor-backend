import os
import tempfile
from pathlib import Path

from app.parsers.slither_parser import parse_slither_result
from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.tools.slither_runner import PROJECT_ROOT, run_slither
from app.services.compiler_service import validate_compilation
from app.services.metadata_service import build_analysis_metadata
from app.core.config import get_settings


def analyze_contract(request: AnalysisRequest) -> AnalysisResponse:
    if not request.source_code.strip():
        raise ValueError("Solidity source code cannot be blank.")
    validate_compilation(request.source_code)
    metadata = build_analysis_metadata(request.source_code)
    workspace_root = get_settings().workspace_directory
    workspace_root.mkdir(parents=True, exist_ok=True)
   
    # Every request gets its own directory and fixed source filename.
    with tempfile.TemporaryDirectory(
        prefix="audit-",
        dir=workspace_root,
    ) as directory:
        source_path = Path(directory) / "Contract.sol"
        # Preserve exactly the UTF-8 bytes used to calculate source_sha256.
        source_path.write_bytes(request.source_code.encode("utf-8"))

        # No detector filter: run Slither's default detector suite.
        raw_result = run_slither(str(source_path))
        source_aliases = {
            source_path.as_posix(): "Contract.sol",
            "Contract.sol": "Contract.sol",
            "./Contract.sol": "Contract.sol",
        }
        try:
            relative = Path(os.path.relpath(source_path, PROJECT_ROOT)).as_posix()
            source_aliases[relative] = "Contract.sol"
        except ValueError:
            # Windows may place a configured workspace on another drive.
            pass

        findings = parse_slither_result(
            raw_result,
            source_sha256=metadata.source_sha256,
            source_aliases=source_aliases,
        )

        return AnalysisResponse(
            audit_id=request.audit_id,
            finding_count=len(findings),
            metadata=metadata,
            findings=findings,
        )
