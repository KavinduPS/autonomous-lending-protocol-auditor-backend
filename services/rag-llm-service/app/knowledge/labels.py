_RULES = [
    ("reentrancy", "reentrancy"),
    ("overflow", "integer_overflow"),
    ("underflow", "integer_overflow"),
    ("arithmetic", "integer_overflow"),
    ("access", "access_control"),
    ("authoriz", "access_control"),
    ("tx.origin", "access_control"),
    ("oracle", "oracle"),
    ("price", "price_manipulation"),
    ("flash", "flash_loan"),
    ("logic", "logic_error"),
]


def to_vuln_class(label: str) -> str:
    text = label.strip().lower()
    for keyword, vuln_class in _RULES:
        if keyword in text:
            return vuln_class
    return "other"
