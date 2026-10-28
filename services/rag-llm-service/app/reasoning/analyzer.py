import logging
import uuid
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.messages import HumanMessage, SystemMessage

from app.code_prep.cleaner import add_line_numbers, remove_comments
from app.code_prep.parser import ContractInfo
from app.code_prep.splitter import split_contract
from app.config import settings
from app.contracts import Retriever
from app.reasoning.prompt import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)


def _call_gemini(system_prompt: str, user_prompt: str) -> list[dict]:
    """Call Google Gemini with structured JSON output via REST API."""
    import httpx
    import json
    import re

    api_key = settings.gemini_api_key
    model = settings.gemini_model or "gemini-3.5-flash-lite"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"{system_prompt}\n\n{user_prompt}\n\nRespond with a valid JSON array only. No markdown code blocks, no backticks, no conversational text."
                    }
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    with httpx.Client(timeout=120) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    candidates = data.get("candidates", [])
    if not candidates:
        logger.warning("Gemini returned no candidates")
        return []

    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        logger.warning("Gemini returned no JSON array, treating as empty")
        return []
    return json.loads(match.group())


def _call_claude(system_prompt: str, user_prompt: str) -> list[dict]:
    """Call LLM (Claude or Gemini fallback) with structured JSON output. Isolated for easy test mocking."""
    if settings.llm_provider.lower() == "gemini" or (settings.gemini_api_key and not settings.anthropic_api_key):
        return _call_gemini(system_prompt, user_prompt)

    llm = ChatAnthropic(
        model=settings.claude_model,
        api_key=settings.anthropic_api_key,
        timeout=120,
        max_retries=2,
    )

    response = llm.with_retry(stop_after_attempt=2).invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt + "\n\nRespond with a JSON array only. No extra text."),
        ]
    )

    content = response.content if hasattr(response, "content") else str(response)

    import json, re
    match = re.search(r"\[.*\]", content, re.DOTALL)
    if not match:
        logger.warning("Claude returned no JSON array, treating as empty")
        return []
    return json.loads(match.group())


def analyze_project(
    audit_id: str,
    sol_files: list[dict],
    contracts: list[ContractInfo],
    retriever: Retriever,
) -> list[dict]:
    """Run the RAG + LLM analysis pipeline for all contracts.

    For each contract:
      1. Clean the source (remove comments, add line numbers)
      2. Retrieve similar known vulnerabilities from the knowledge base
      3. Build the prompt and call LLM (Claude or Gemini)
      4. Collect raw hypotheses

    Returns unsorted, unvalidated raw hypotheses (validator handles cleanup).
    """
    all_hypotheses: list[dict[str, Any]] = []

    for sol_file in sol_files:
        file_path = sol_file["path"]
        raw_source = sol_file["content"]

        logger.info("audit_id=%s analyzing %s", audit_id, file_path)

        cleaned = remove_comments(raw_source)
        chunks = split_contract(file_path, cleaned)

        for chunk in chunks:
            numbered = add_line_numbers(chunk["content"])

            query = chunk["content"][:2000]
            try:
                retrieved = retriever.retrieve(query, top_k=4)
            except Exception as exc:
                logger.warning(
                    "audit_id=%s retriever failed for %s: %s", audit_id, file_path, exc
                )
                retrieved = []

            user_prompt = build_user_prompt(file_path, numbered, retrieved)

            try:
                raw = _call_claude(SYSTEM_PROMPT, user_prompt)
            except Exception as exc:
                logger.error(
                    "audit_id=%s LLM call failed for %s: %s", audit_id, file_path, exc
                )
                continue

            if not isinstance(raw, list):
                logger.warning(
                    "audit_id=%s LLM returned non-list output for %s, skipping",
                    audit_id,
                    file_path,
                )
                continue

            for i, h in enumerate(raw):
                h.setdefault("id", f"h{len(all_hypotheses) + i + 1}")
                h.setdefault("title", h.get("name", "Potential Vulnerability"))
                h.setdefault("vuln_class", "other")
                h.setdefault("reason", "")
                h.setdefault("attack_idea", "")
                h.setdefault("severity", "medium")
                h.setdefault("confidence", 0.75)
                h.setdefault("location", {})
                if isinstance(h["location"], dict):
                    h["location"].setdefault("file", file_path)
                    h["location"].setdefault("contract", "")
                    h["location"].setdefault("function", "")
                    h["location"].setdefault("lines", [])
                similar = h.get("similar_incidents", [])
                if isinstance(similar, list):
                    for inc in similar:
                        if isinstance(inc, dict):
                            inc.setdefault("source", "unknown")
                            inc.setdefault("name", "unknown")
            all_hypotheses.extend(raw)

    all_hypotheses.sort(key=lambda h: h.get("confidence", 0.0), reverse=True)
    logger.info("audit_id=%s total raw hypotheses: %d", audit_id, len(all_hypotheses))
    return all_hypotheses
