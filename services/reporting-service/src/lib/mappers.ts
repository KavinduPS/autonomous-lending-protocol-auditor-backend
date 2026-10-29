import type {
  Confidence,
  DetectionSource,
  Severity,
} from "../generated/prisma/client.js";
import {
  STATIC_RULE_CATEGORY,
  STATIC_RULE_TITLE,
} from "../constants/slitherDetectors.js";

// ---------- types ----------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingError";
  }
}

/** One finding from the static service (matches its real output). */
export interface StaticFinding {
  finding_id: string;
  tool_finding_id?: string;
  tool?: string;
  rule_id: string;
  description: string;
  severity: string; // Slither impact: High, Medium, Low, Informational, Optimization
  confidence: string; // High, Medium, Low
  reference?: string | null;
  locations?: Array<{
    file?: string | null;
    start_line?: number | null;
    end_line?: number | null;
  }>;
}

/** One RAG hypothesis. */
export interface RagHypothesis {
  id: string;
  title: string;
  location?: {
    file?: string | null;
    contract?: string | null;
    function?: string | null;
    lines?: number[] | null;
  };
  vuln_class: string;
  reason: string;
  confidence: number; // 0 to 1
  severity: string; // critical, high, medium, low
}

export interface MappedDetection {
  source: DetectionSource;
  sourceRef: string | null;
  ruleId: string | null;
  severity: Severity;
  confidence: Confidence;
  description: string;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  raw: JsonValue;
}

export interface MappedFindingFields {
  title: string;
  categoryCode: string;
  severity: Severity;
  contractName: string | null;
  functionName: string | null;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
}

export interface MappedItem {
  finding: MappedFindingFields;
  detection: MappedDetection;
}

// ---------- severity ----------

export const SEVERITY_ORDER: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];

const STATIC_SEVERITY: Record<string, Severity> = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  informational: "INFO",
  optimization: "INFO",
};

const RAG_SEVERITY: Record<string, Severity> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export function mapStaticSeverity(impact: string): Severity {
  const mapped = STATIC_SEVERITY[impact.trim().toLowerCase()];
  if (!mapped) throw new MappingError(`Unknown static severity: ${impact}`);
  return mapped;
}

export function mapRagSeverity(severity: string): Severity {
  const mapped = RAG_SEVERITY[severity.trim().toLowerCase()];
  if (!mapped) throw new MappingError(`Unknown RAG severity: ${severity}`);
  return mapped;
}

/** A finding's severity is the highest severity among its detections. */
export function highestSeverity(severities: Severity[]): Severity {
  if (severities.length === 0) {
    throw new MappingError("highestSeverity needs at least one severity");
  }
  return severities.reduce((best, s) =>
    SEVERITY_ORDER.indexOf(s) < SEVERITY_ORDER.indexOf(best) ? s : best,
  );
}

// ---------- confidence ----------

const STATIC_CONFIDENCE: Record<string, Confidence> = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export function mapStaticConfidence(confidence: string): Confidence {
  const mapped = STATIC_CONFIDENCE[confidence.trim().toLowerCase()];
  if (!mapped)
    throw new MappingError(`Unknown static confidence: ${confidence}`);
  return mapped;
}

/** RAG confidence is 0 to 1: >= 0.75 HIGH, >= 0.5 MEDIUM, otherwise LOW. */
export function mapRagConfidence(score: number): Confidence {
  if (
    typeof score !== "number" ||
    Number.isNaN(score) ||
    score < 0 ||
    score > 1
  ) {
    throw new MappingError(
      `RAG confidence must be between 0 and 1, got ${score}`,
    );
  }
  if (score >= 0.75) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

// ---------- category ----------

export const CATEGORY_CODES = [
  "reentrancy",
  "access_control",
  "price_manipulation",
  "oracle",
  "flash_loan",
  "integer_overflow",
  "logic_error",
  "other",
] as const;

export function mapStaticCategory(ruleId: string): string {
  return STATIC_RULE_CATEGORY[ruleId] ?? "other";
}

/** RAG vuln_class is the category code. Unknown classes fall back to "other". */
export function mapRagCategory(vulnClass: string): string {
  return (CATEGORY_CODES as readonly string[]).includes(vulnClass)
    ? vulnClass
    : "other";
}

// ---------- title ----------

/** reentrancy-eth -> "Reentrancy eth" (fallback for unknown detectors) */
export function titleFromRuleId(ruleId: string): string {
  const text = ruleId.replace(/-/g, " ").trim();
  if (!text) return "Static analysis finding";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Readable detector label, falling back to the formatted rule id. */
export function titleForRule(ruleId: string): string {
  return STATIC_RULE_TITLE[ruleId] ?? titleFromRuleId(ruleId);
}

// ---------- detectedBy ----------

export function detectedByLabel(source: DetectionSource): string {
  return source === "SLITHER" ? "slither" : "rag";
}

export function buildDetectedBy(sources: DetectionSource[]): string[] {
  return [...new Set(sources.map(detectedByLabel))].sort();
}

// ---------- detection mappers ----------

export function mapStaticFinding(f: StaticFinding): MappedItem {
  const first = f.locations?.[0];
  const file = first?.file ?? null;
  const lineStart = first?.start_line ?? null;
  const lineEnd = first?.end_line ?? null;
  const severity = mapStaticSeverity(f.severity);

  return {
    finding: {
      title: titleForRule(f.rule_id),
      categoryCode: mapStaticCategory(f.rule_id),
      severity,
      contractName: null,
      functionName: null,
      file,
      lineStart,
      lineEnd,
    },
    detection: {
      source: "SLITHER",
      sourceRef: f.finding_id,
      ruleId: f.rule_id,
      severity,
      confidence: mapStaticConfidence(f.confidence),
      description: f.description,
      file,
      lineStart,
      lineEnd,
      raw: f as unknown as JsonValue, // keeps every location
    },
  };
}

export function mapRagHypothesis(h: RagHypothesis): MappedItem {
  const loc = h.location ?? {};
  const lines = (loc.lines ?? []).filter((n) => Number.isInteger(n));
  const lineStart = lines.length ? Math.min(...lines) : null;
  const lineEnd = lines.length ? Math.max(...lines) : null;
  const file = loc.file ?? null;
  const severity = mapRagSeverity(h.severity);

  return {
    finding: {
      title: h.title,
      categoryCode: mapRagCategory(h.vuln_class),
      severity,
      contractName: loc.contract ?? null,
      functionName: loc.function ?? null,
      file,
      lineStart,
      lineEnd,
    },
    detection: {
      source: "RAG",
      sourceRef: h.id,
      ruleId: null,
      severity,
      confidence: mapRagConfidence(h.confidence),
      description: h.reason,
      file,
      lineStart,
      lineEnd,
      raw: h as unknown as JsonValue, // keeps the original confidence number
    },
  };
}
