import json

import re
from itertools import islice
from pathlib import Path

from datasets import load_dataset

from collections.abc import Iterable, Iterator
from dataclasses import dataclass

from huggingface_hub import hf_hub_download
from pydantic import ValidationError

from app.knowledge.labels import to_vuln_class
from app.knowledge.models import KnowledgeChunk
from app.knowledge.settings import settings


@dataclass
class LoadStats:
    read: int = 0
    skipped_bad_json: int = 0
    skipped_not_vulnerable: int = 0
    skipped_duplicate: int = 0
    skipped_invalid: int = 0
    skipped_no_analysis: int = 0


def _scv_text(row: dict) -> str:
    parts = []
    if row.get("category"):
        parts.append(f"Vulnerability: {row['category']}")
    if row.get("description"):
        parts.append(f"Description: {row['description']}")
    if row.get("code_snippet"):
        parts.append(f"Vulnerable code:\n{row['code_snippet']}")
    if row.get("poc"):
        parts.append(f"Example exploit:\n{row['poc']}")
    return "\n".join(parts)


def _severity(row: dict) -> str | None:
    value = row.get("severity")
    return str(value).strip().lower() if value else None


def parse_scv_lines(lines: Iterable[str], stats: LoadStats) -> Iterator[KnowledgeChunk]:
    seen: set[str] = set()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        stats.read += 1
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            stats.skipped_bad_json += 1
            continue
        if not isinstance(row, dict):
            stats.skipped_invalid += 1
            continue
        if str(row.get("vulnerable", True)).lower() == "false":
            stats.skipped_not_vulnerable += 1
            continue
        row_id = str(row.get("id", "")).strip()
        if row_id in seen:
            stats.skipped_duplicate += 1
            continue
        category = str(row.get("category", "")).strip()
        try:
            chunk = KnowledgeChunk(
                text=_scv_text(row),
                source="scv",
                source_id=row_id,
                title=f"{row_id}: {category or 'Unknown'}",
                vuln_class=to_vuln_class(category),
                severity=_severity(row),
            )
        except ValidationError:
            stats.skipped_invalid += 1
            continue
        seen.add(row_id)
        yield chunk


def load_scv(stats: LoadStats | None = None) -> Iterator[KnowledgeChunk]:
    stats = stats if stats is not None else LoadStats()
    path = hf_hub_download(
        repo_id=settings.scv_dataset,
        filename=settings.scv_filename,
        repo_type="dataset",
        revision=settings.scv_revision,
    )
    with open(path, encoding="utf-8") as handle:
        yield from parse_scv_lines(handle, stats)


_DATE_PATTERN = re.compile(r"^(\d{4})_(\d{2})_")


def _clean(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())


def _incident_date(row_id: str) -> str | None:
    match = _DATE_PATTERN.match(row_id)
    return f"{match.group(1)}-{match.group(2)}" if match else None


def _attack_steps(value: object) -> str:
    if not isinstance(value, str):
        return ""
    steps = [step.strip() for step in value.split("||") if step.strip()]
    return "\n".join(f"{number}. {step}" for number, step in enumerate(steps, start=1))


def _defihacklabs_text(row: dict, name: str, date: str | None) -> str:
    lines = [f"Incident: {name}" + (f" ({date})" if date else "")]
    sections = [
        ("Vulnerability type", _clean(row.get("ai_vulnerability_type"))),
        ("Root cause", _clean(row.get("ai_root_cause"))),
        ("What happened", _clean(row.get("ai_explanation"))),
    ]
    for label, value in sections:
        if value:
            lines.append(f"{label}: {value}")
    steps = _attack_steps(row.get("ai_attack_steps_text"))
    if steps:
        lines.append(f"Attack steps:\n{steps}")
    return "\n".join(lines)


def parse_defihacklabs_rows(
    rows: Iterable[dict], stats: LoadStats
) -> Iterator[KnowledgeChunk]:
    seen: set[str] = set()
    for row in rows:
        stats.read += 1
        row_id = _clean(row.get("id"))
        name = _clean(row.get("title"))
        if not row_id or not name:
            stats.skipped_invalid += 1
            continue
        if row_id in seen:
            stats.skipped_duplicate += 1
            continue
        if not (_clean(row.get("ai_root_cause")) or _clean(row.get("ai_explanation"))):
            stats.skipped_no_analysis += 1
            continue
        date = _incident_date(row_id)
        try:
            chunk = KnowledgeChunk(
                text=_defihacklabs_text(row, name, date),
                source="defihacklabs",
                source_id=row_id,
                title=f"{name} ({date})" if date else name,
                vuln_class=to_vuln_class(
                    _clean(row.get("ai_vulnerability_type"))),
                incident_name=name,
            )
        except ValidationError:
            stats.skipped_invalid += 1
            continue
        seen.add(row_id)
        yield chunk


def load_defihacklabs(stats: LoadStats | None = None) -> Iterator[KnowledgeChunk]:
    stats = stats if stats is not None else LoadStats()
    rows = load_dataset(
        settings.defihacklabs_dataset,
        split="train",
        streaming=True,
        revision=settings.defihacklabs_revision or None,
    )
    yield from parse_defihacklabs_rows(rows, stats)


_LINK = re.compile(r"\[([^\]\n]*)\]\(https?://[^)\s]*\)")
_BARE_URL = re.compile(r"<?https?://[^\s<>)\]]+>?")


def _short_url(match: re.Match[str]) -> str:
    last = match.group(0).strip("<>").rstrip("/").rsplit("/", 1)[-1]
    return last if ".sol" in last else ""


_HEADING_LINK_TAIL = re.compile(r"\]\(https?://[^)\s]*\)")
_FINDING_ID = re.compile(r"^[HM]-\d+\s*")
_HTML_BREAK = re.compile(r"<br\s*/?>", re.IGNORECASE)


def _is_submitted_by(line: str) -> bool:
    return line.strip().lstrip("*_ ").lower().startswith("submitted by")


def _split_finding(text: str) -> tuple[str, str]:
    lines = [line for line in text.splitlines() if not _is_submitted_by(line)]
    title = ""
    rest: list[str] = []
    for index, line in enumerate(lines):
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            heading = _HEADING_LINK_TAIL.sub("", stripped)
            heading = heading.replace("[", "").replace("]", "")
            title = _FINDING_ID.sub("", heading).strip()
            rest = lines[index + 1:]
            break
    body = _HTML_BREAK.sub("", _LINK.sub(r"\1", "\n".join(rest)))
    body = _BARE_URL.sub(_short_url, body).strip()
    return title[:200], body


def parse_code4rena_lines(
    lines: Iterable[str], stats: LoadStats
) -> Iterator[KnowledgeChunk]:
    seen: set[str] = set()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        stats.read += 1
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            stats.skipped_bad_json += 1
            continue
        if not isinstance(row, dict):
            stats.skipped_invalid += 1
            continue
        row_id = _clean(row.get("id"))
        title, body = _split_finding(str(row.get("text") or ""))
        if not row_id or not (title or body):
            stats.skipped_invalid += 1
            continue
        if row_id in seen:
            stats.skipped_duplicate += 1
            continue
        contest = _clean(row.get("contest")) or "unknown contest"
        severity = _clean(row.get("severity")).lower() or None
        finding_title = title or row_id
        label = f"{contest}, {severity} severity" if severity else contest
        text = "\n".join(
            part
            for part in (f"Code4rena finding ({label})", f"Title: {finding_title}", body)
            if part
        )
        try:
            chunk = KnowledgeChunk(
                text=text,
                source="code4rena",
                source_id=row_id,
                title=f"{contest}: {finding_title}",
                vuln_class=to_vuln_class(finding_title),
                severity=severity,
            )
        except ValidationError:
            stats.skipped_invalid += 1
            continue
        seen.add(row_id)
        yield chunk


def load_code4rena(stats: LoadStats | None = None) -> Iterator[KnowledgeChunk]:
    stats = stats if stats is not None else LoadStats()
    path = Path(settings.code4rena_path)
    if not path.is_file():
        raise FileNotFoundError(f"Code4rena file not found: {path}")
    with open(path, encoding="utf-8") as handle:
        chunks = parse_code4rena_lines(handle, stats)
        yield from islice(chunks, settings.code4rena_max_rows)
