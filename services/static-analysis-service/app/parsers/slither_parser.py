import hashlib
import json

from app.schemas.finding import Finding, FindingLocation


def parse_slither_result(
    result: dict,
    *,
    source_sha256: str | None = None,
    source_aliases: dict[str, str] | None = None,
) -> list[Finding]:
    if result.get("success") is not True:
        raise ValueError("Cannot parse an unsuccessful Slither result.")

    aliases = {
        key.replace("\\", "/"): value.replace("\\", "/")
        for key, value in (source_aliases or {}).items()
    }
    findings = []

    # Slither can return "results": {} when nothing is found.
    detectors = result.get("results", {}).get("detectors", [])

    for detector in detectors:
        locations = []
        seen_locations = set()

        for element in detector.get("elements", []):
            mapping = element.get("source_mapping", {})

            # Prefer project-relative paths in service responses.
            filename = (
                mapping.get("filename_relative")
                or mapping.get("filename_short")
                or mapping.get("filename_absolute")
            )

            if not filename:
                continue

            filename = filename.replace("\\", "/")
            filename = aliases.get(filename, filename)
            lines = mapping.get("lines", [])

            start_line = min(lines) if lines else None
            end_line = max(lines) if lines else None

            location_key = (filename, start_line, end_line)

            if location_key in seen_locations:
                continue

            seen_locations.add(location_key)

            locations.append(
                FindingLocation(
                    file=filename,
                    start_line=start_line,
                    end_line=end_line,
                )
            )

        locations.sort(key=lambda item: (
            item.file,
            -1 if item.start_line is None else item.start_line,
            -1 if item.end_line is None else item.end_line,
        ))

        description = detector["description"].strip().replace("\r\n", "\n")
        for original, replacement in sorted(
            aliases.items(), key=lambda item: len(item[0]), reverse=True
        ):
            description = description.replace(original, replacement)
            description = description.replace(
                original.replace("/", "\\"), replacement
            )

        fingerprint = {
            "tool": "slither",
            "source_sha256": source_sha256,
            "rule_id": detector["check"],
            "description": description,
            "locations": [item.model_dump() for item in locations],
        }
        finding_id = hashlib.sha256(
            json.dumps(fingerprint, sort_keys=True).encode("utf-8")
        ).hexdigest()

        findings.append(
            Finding(
                finding_id=finding_id,
                tool_finding_id=detector.get("id"),
                rule_id=detector["check"],
                description=description,
                severity=detector["impact"],
                confidence=detector["confidence"],
                reference=detector.get("reference"),
                locations=locations,
            )
        )

    return findings
