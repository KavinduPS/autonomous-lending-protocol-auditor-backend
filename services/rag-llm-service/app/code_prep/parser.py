import re
from dataclasses import dataclass, field


@dataclass
class FunctionInfo:
    name: str
    start_line: int
    end_line: int


@dataclass
class ContractInfo:
    name: str
    file: str
    start_line: int
    end_line: int
    is_proxy: bool = False
    implementation: str | None = None
    functions: list[FunctionInfo] = field(default_factory=list)


_CONTRACT_RE = re.compile(
    r"^\s*(?:abstract\s+)?(?:contract|interface|library)\s+(\w+)",
    re.MULTILINE,
)

_FUNC_RE = re.compile(
    r"^\s*function\s+(\w+)\s*\(",
    re.MULTILINE,
)


_PROXY_KEYWORDS = {"delegatecall", "upgradeable", "proxy", "implementation"}


def parse_contracts(file_path: str, source: str) -> list[ContractInfo]:
    """Extract contract names, function names, and approximate line ranges from Solidity source."""
    lines = source.splitlines()
    contracts: list[ContractInfo] = []

    contract_matches = list(_CONTRACT_RE.finditer(source))

    for idx, match in enumerate(contract_matches):
        name = match.group(1)
        start_line = source[: match.start()].count("\n") + 1

        if idx + 1 < len(contract_matches):
            end_line = source[: contract_matches[idx + 1].start()].count("\n")
        else:
            end_line = len(lines)

        contract_source = "\n".join(lines[start_line - 1 : end_line])

    
        is_proxy = any(kw in contract_source.lower() for kw in _PROXY_KEYWORDS)

        functions = _parse_functions(contract_source, start_line)

        contracts.append(
            ContractInfo(
                name=name,
                file=file_path,
                start_line=start_line,
                end_line=end_line,
                is_proxy=is_proxy,
                functions=functions,
            )
        )

    return contracts


def _parse_functions(contract_source: str, contract_start_line: int) -> list[FunctionInfo]:
    """Extract function names and their approximate line ranges within a contract block."""
    functions: list[FunctionInfo] = []
    func_matches = list(_FUNC_RE.finditer(contract_source))
    contract_lines = contract_source.splitlines()

    for idx, match in enumerate(func_matches):
        name = match.group(1)
        start_line = contract_start_line + contract_source[: match.start()].count("\n")

        if idx + 1 < len(func_matches):
            end_line = contract_start_line + contract_source[: func_matches[idx + 1].start()].count("\n") - 1
        else:
            end_line = contract_start_line + len(contract_lines) - 1

        functions.append(FunctionInfo(name=name, start_line=start_line, end_line=end_line))

    return functions
