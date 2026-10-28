import logging
from app.contracts import VULN_CLASSES
from app.code_prep.parser import ContractInfo

logger = logging.getLogger(__name__)


def validate_hypotheses(
    raw_hypotheses: list[dict],
    contracts: list[ContractInfo],
) -> list[dict]:
    """Clean and validate Claude output before saving to the database.

    Drops any hypothesis whose file or function does not exist in the prepared code.
    Forces vuln_class into VULN_CLASSES (else 'other').
    Clamps confidence to [0.0, 1.0].
    This protects the execution service from hallucinated locations.
    """

    valid_locations: dict[str, set[str]] = {}
    for contract in contracts:
        path = contract.file
        if path not in valid_locations:
            valid_locations[path] = set()
        for fn in contract.functions:
            valid_locations[path].add(fn.name)

    valid: list[dict] = []

    for h in raw_hypotheses:
        loc = h.get("location", {})
        file_path = loc.get("file", "")
        function_name = loc.get("function", "")

        if file_path not in valid_locations:
            logger.warning(
                "Dropping hypothesis '%s': file '%s' not in project",
                h.get("title", "?"),
                file_path,
            )
            continue
        if function_name and function_name not in valid_locations[file_path]:
            logger.warning(
                "Dropping hypothesis '%s': function '%s' not found in '%s'",
                h.get("title", "?"),
                function_name,
                file_path,
            )
            continue

        if h.get("vuln_class") not in VULN_CLASSES:
            logger.debug(
                "Normalising vuln_class '%s' -> 'other'", h.get("vuln_class")
            )
            h["vuln_class"] = "other"

        try:
            h["confidence"] = max(0.0, min(1.0, float(h.get("confidence", 0.5))))
        except (TypeError, ValueError):
            h["confidence"] = 0.5

        valid.append(h)

    logger.info(
        "Validator: %d/%d hypotheses passed", len(valid), len(raw_hypotheses)
    )
    return valid
