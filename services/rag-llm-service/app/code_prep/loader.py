import logging
from pathlib import Path

logger = logging.getLogger(__name__)


MAX_FILE_COUNT = 50
MAX_TOTAL_BYTES = 2 * 1024 * 1024  # 2 MB


SKIP_DIRS = {"node_modules", "lib", "test", "tests", "script", "scripts", ".git"}


def load_sol_files(project_ref: str) -> list[dict]:
    """Find all .sol files under project_ref, skip common non-production folders.

    Returns a list of dicts with keys: path (str), content (str).
    Raises ValueError if limits are exceeded or path is invalid.
    """
    root = Path(project_ref)
    if not root.exists() or not root.is_dir():
        raise ValueError(f"project_ref '{project_ref}' is not a valid directory.")

    sol_files = []
    total_bytes = 0

    for sol_path in sorted(root.rglob("*.sol")):
       
        if any(part in SKIP_DIRS for part in sol_path.parts):
            logger.debug("Skipping %s (excluded folder)", sol_path)
            continue

        size = sol_path.stat().st_size
        total_bytes += size

        if len(sol_files) >= MAX_FILE_COUNT:
            raise ValueError(
                f"Project exceeds the {MAX_FILE_COUNT}-file limit. "
                "Only production Solidity contracts are supported."
            )
        if total_bytes > MAX_TOTAL_BYTES:
            raise ValueError(
                f"Project exceeds the {MAX_TOTAL_BYTES // 1024} KB size limit."
            )

        content = sol_path.read_text(encoding="utf-8", errors="replace")
        sol_files.append({"path": str(sol_path.relative_to(root)), "content": content})
        logger.debug("Loaded %s (%d bytes)", sol_path, size)

    if not sol_files:
        raise ValueError(f"No .sol files found under '{project_ref}'.")

    logger.info("Loaded %d .sol files from %s", len(sol_files), project_ref)
    return sol_files
