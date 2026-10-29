import type { Severity } from "../generated/prisma/client.js";
import { SEVERITY_ORDER } from "../lib/mappers.js";

export const PROFIT_NOTE =
  "profit_native counts native currency only; 0 means no native currency movement detected.";

// ---------- input types (what the controller loads from the database) ----------

export interface ReportDetection {
  source: "SLITHER" | "RAG";
  sourceRef: string | null;
  ruleId: string | null;
  severity: Severity;
  confidence: string;
  description: string;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  raw: unknown;
}

export interface ReportAttempt {
  id: string;
  attemptNo: number;
  outcome: "CONFIRMED" | "NOT_CONFIRMED" | "ERROR";
  evidence: unknown;
}

export interface ReportFinding {
  id: string;
  title: string;
  severity: Severity;
  verificationStatus: "UNVERIFIED" | "CONFIRMED" | "NOT_CONFIRMED";
  triageDecision: string | null;
  triageScore: number | string | { toString(): string } | null;
  triageReason: string | null;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  contractName: string | null;
  functionName: string | null;
  category: { code: string; name: string; defaultMitigation: string | null };
  detections: ReportDetection[];
  exploitAttempts: ReportAttempt[];
}

export interface ReportAudit {
  id: string;
  contractName: string;
  status: string;
  errorMessage: string | null;
  sourceUri: string;
  sourceSha256: string | null;
  chain: string | null;
  blockNumber: number | null;
  slitherVersion: string | null;
  compilerVersion: string | null;
  baseline: unknown;
  createdAt: Date;
  completedAt: Date | null;
  stages: Array<{ stage: string; status: string }>;
  findings: ReportFinding[];
}

// ---------- small parsing helpers ----------

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export interface ParsedRun {
  status: string | null;
  revertReason: string | null;
  profitNative: number | null;
  gasUsed: number | null;
  durationMs: number | null;
}

/** Reads one sandbox run (a baseline or an attempt's evidence). Never throws. */
export function parseRun(raw: unknown): ParsedRun {
  const r = asRecord(raw) ?? {};
  return {
    status: str(r.status),
    revertReason: str(r.revert_reason),
    profitNative: num(r.profit_native),
    gasUsed: num(r.gas_used),
    durationMs: num(r.duration_ms),
  };
}

/** Baseline without the trace. Returns null when there is no baseline. */
export function parseBaseline(raw: unknown) {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    ...parseRun(r),
    chain: str(r.chain),
    blockNumber: num(r.block_number),
  };
}

// ---------- simulation rules (README section 7) ----------

export type SimulationLabel =
  | "Confirmed"
  | "Not confirmed"
  | "Could not run"
  | "Skipped"
  | "Not tested";

export function simulationLabel(f: {
  verificationStatus: string;
  triageDecision: string | null;
  exploitAttempts: Array<{ outcome: string }>;
}): SimulationLabel {
  if (f.verificationStatus === "CONFIRMED") return "Confirmed";
  if (f.verificationStatus === "NOT_CONFIRMED") return "Not confirmed";
  const attempts = f.exploitAttempts;
  if (attempts.length > 0 && attempts.every((a) => a.outcome === "ERROR")) {
    return "Could not run";
  }
  if (f.triageDecision === "SKIP") return "Skipped";
  return "Not tested";
}

/** The latest CONFIRMED attempt, else the latest attempt that is not ERROR. */
export function pickBestAttempt<
  T extends { attemptNo: number; outcome: string },
>(attempts: T[]): T | null {
  const latestFirst = [...attempts].sort((a, b) => b.attemptNo - a.attemptNo);
  return (
    latestFirst.find((a) => a.outcome === "CONFIRMED") ??
    latestFirst.find((a) => a.outcome !== "ERROR") ??
    null
  );
}

/**
 * Attempt compared with the baseline. The whole result is null when there is no
 * baseline or no usable attempt. Each number is null on its own when it cannot
 * be computed (missing values, or baseline gas of 0).
 */
export function computeVsBaseline(
  baseline: ParsedRun | null,
  attempt: { attemptNo: number; run: ParsedRun } | null,
) {
  if (!baseline || !attempt) return null;
  const bp = baseline.profitNative;
  const bg = baseline.gasUsed;
  const ap = attempt.run.profitNative;
  const ag = attempt.run.gasUsed;
  return {
    attemptNo: attempt.attemptNo,
    profitNativeDelta: bp != null && ap != null ? round(ap - bp, 12) : null,
    gasRatio: bg != null && bg > 0 && ag != null ? round(ag / bg, 3) : null,
  };
}

// ---------- ordering ----------

const STAGE_ORDER = ["STATIC", "RAG", "EPA", "SIMULATION"];

export function compareFindings(
  a: { severity: Severity; lineStart: number | null; title: string },
  b: { severity: Severity; lineStart: number | null; title: string },
): number {
  const bySeverity =
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  if (bySeverity !== 0) return bySeverity;
  const la = a.lineStart ?? Number.POSITIVE_INFINITY;
  const lb = b.lineStart ?? Number.POSITIVE_INFINITY;
  if (la !== lb) return la < lb ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export function sortStages<T extends { stage: string }>(stages: T[]): T[] {
  return [...stages].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
  );
}

// ---------- the full report ----------

function staticComponent(d: ReportDetection | undefined) {
  if (!d) return null;
  return {
    ruleId: d.ruleId,
    severity: d.severity,
    confidence: d.confidence,
    description: d.description,
    file: d.file,
    lineStart: d.lineStart,
    lineEnd: d.lineEnd,
  };
}

function ragComponent(d: ReportDetection | undefined) {
  if (!d) return null;
  return {
    severity: d.severity,
    confidence: d.confidence,
    confidenceScore: num(asRecord(d.raw)?.confidence),
    description: d.description,
    file: d.file,
    lineStart: d.lineStart,
    lineEnd: d.lineEnd,
  };
}

export function buildFullReport(audit: ReportAudit) {
  const header = {
    audit: {
      id: audit.id,
      contractName: audit.contractName,
      status: audit.status,
      errorMessage: audit.errorMessage,
      createdAt: audit.createdAt,
      completedAt: audit.completedAt,
    },
    scope: {
      sourceUri: audit.sourceUri,
      sourceSha256: audit.sourceSha256,
      chain: audit.chain,
      blockNumber: audit.blockNumber,
      slitherVersion: audit.slitherVersion,
      compilerVersion: audit.compilerVersion,
    },
    stages: sortStages(audit.stages).map((s) => ({
      stage: s.stage,
      status: s.status,
    })),
  };

  if (audit.status !== "COMPLETE") {
    return { ...header, findings: [] };
  }

  const baseline = parseBaseline(audit.baseline);
  const sorted = [...audit.findings].sort(compareFindings);

  const bySeverity = Object.fromEntries(
    SEVERITY_ORDER.map((s) => [s, 0]),
  ) as Record<Severity, number>;
  let flaggedByStatic = 0;
  let flaggedByRag = 0;
  let flaggedByBoth = 0;
  let sentToSimulation = 0;
  let confirmed = 0;

  const findings = sorted.map((f) => {
    const stat = f.detections.find((d) => d.source === "SLITHER");
    const rag = f.detections.find((d) => d.source === "RAG");
    const attempts = [...f.exploitAttempts].sort(
      (a, b) => a.attemptNo - b.attemptNo,
    );
    const label = simulationLabel(f);

    bySeverity[f.severity]++;
    if (stat) flaggedByStatic++;
    if (rag) flaggedByRag++;
    if (stat && rag) flaggedByBoth++;
    if (f.triageDecision === "SIMULATE" || attempts.length > 0) {
      sentToSimulation++;
    }
    if (f.verificationStatus === "CONFIRMED") confirmed++;

    const parsedAttempts = attempts.map((a) => ({
      id: a.id,
      attemptNo: a.attemptNo,
      outcome: a.outcome,
      run: parseRun(a.evidence),
    }));
    const best = pickBestAttempt(parsedAttempts);

    return {
      id: f.id,
      title: f.title,
      category: { code: f.category.code, name: f.category.name },
      severity: f.severity,
      location: {
        file: f.file,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        contract: f.contractName,
        function: f.functionName,
      },
      verificationStatus: f.verificationStatus,
      verification: label,
      triage: f.triageDecision
        ? {
            decision: f.triageDecision,
            score: f.triageScore != null ? Number(String(f.triageScore)) : null,
            reason: f.triageReason,
          }
        : null,
      recommendation: f.category.defaultMitigation,
      components: {
        staticAnalysis: staticComponent(stat),
        ragLlm: ragComponent(rag),
        simulation:
          parsedAttempts.length > 0
            ? {
                attempts: parsedAttempts.map((a) => ({
                  id: a.id,
                  attemptNo: a.attemptNo,
                  outcome: a.outcome,
                  ...a.run,
                })),
                vsBaseline: computeVsBaseline(baseline, best),
              }
            : null,
      },
    };
  });

  const comparison = findings.map((f, i) => ({
    findingId: f.id,
    title: f.title,
    severity: f.severity,
    static: f.components.staticAnalysis !== null,
    rag: f.components.ragLlm !== null,
    simulation: findings[i].verification,
  }));

  return {
    ...header,
    summary: {
      bySeverity,
      totalFindings: findings.length,
      flaggedByStatic,
      flaggedByRag,
      flaggedByBoth,
      sentToSimulation,
      confirmed,
    },
    baseline,
    comparison,
    findings,
    notes: [PROFIT_NOTE],
  };
}
