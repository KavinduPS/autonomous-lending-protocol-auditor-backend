import type { Prisma } from "../generated/prisma/client.js";
import {
  buildDetectedBy,
  highestSeverity,
  mapRagHypothesis,
  mapStaticFinding,
  type MappedItem,
  type RagHypothesis,
  type StaticFinding,
} from "../lib/mappers.js";

// Static always reports this name for single-file submissions.
const SINGLE_FILE_NAME = "Contract.sol";

// ---------- pure helpers ----------

function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Files match when equal, or when either side is the single-file name. */
export function filesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = normalizePath(a);
  const y = normalizePath(b);
  return x === y || x === SINGLE_FILE_NAME || y === SINGLE_FILE_NAME;
}

export function rangesOverlap(
  aStart: number | null,
  aEnd: number | null,
  bStart: number | null,
  bEnd: number | null,
): boolean {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
    return false;
  }
  return aStart <= bEnd && aEnd >= bStart;
}

export interface MergeCandidate {
  id: string;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
}

/**
 * Picks the finding to merge into: same file, overlapping lines. When several
 * qualify, the one with the biggest overlap wins (first one on a tie).
 * Returns null when nothing qualifies.
 */
export function pickMergeTarget(
  candidates: MergeCandidate[],
  incoming: {
    file: string | null;
    lineStart: number | null;
    lineEnd: number | null;
  },
): string | null {
  let bestId: string | null = null;
  let bestSize = -1;

  for (const c of candidates) {
    if (!filesMatch(c.file, incoming.file)) continue;
    if (
      !rangesOverlap(
        c.lineStart,
        c.lineEnd,
        incoming.lineStart,
        incoming.lineEnd,
      )
    ) {
      continue;
    }
    const size =
      Math.min(c.lineEnd!, incoming.lineEnd!) -
      Math.max(c.lineStart!, incoming.lineStart!) +
      1;
    if (size > bestSize) {
      bestSize = size;
      bestId = c.id;
    }
  }
  return bestId;
}

// ---------- database ----------

/**
 * Attaches one detection to the audit: merges it into an existing finding when
 * the section 6 rules allow, otherwise creates a new finding.
 * Call it inside a transaction.
 */
export async function attachDetection(
  tx: Prisma.TransactionClient,
  auditId: string,
  item: MappedItem,
): Promise<{ findingId: string; merged: boolean }> {
  const { finding: f, detection: d } = item;

  const detectionData = {
    source: d.source,
    sourceRef: d.sourceRef,
    ruleId: d.ruleId,
    severity: d.severity,
    confidence: d.confidence,
    description: d.description,
    file: d.file,
    lineStart: d.lineStart,
    lineEnd: d.lineEnd,
    raw: d.raw as Prisma.InputJsonValue,
  };

  // Rule 3 is applied in the query: only findings with no detection from this source.
  // Rules 1 and 2 need both sides to have a file and line numbers.
  const canMerge = f.file != null && f.lineStart != null && f.lineEnd != null;
  const candidates = canMerge
    ? await tx.finding.findMany({
        where: {
          auditId,
          lineStart: { not: null },
          lineEnd: { not: null },
          detections: { none: { source: d.source } },
        },
        select: { id: true, file: true, lineStart: true, lineEnd: true },
        orderBy: [{ lineStart: "asc" }, { id: "asc" }],
      })
    : [];

  const targetId = pickMergeTarget(candidates, f);

  if (!targetId) {
    const created = await tx.finding.create({
      data: {
        auditId,
        categoryCode: f.categoryCode,
        title: f.title,
        severity: f.severity,
        detectedBy: buildDetectedBy([d.source]),
        file: f.file,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        contractName: f.contractName,
        functionName: f.functionName,
        detections: { create: detectionData },
      },
    });
    return { findingId: created.id, merged: false };
  }

  const existing = await tx.finding.findUniqueOrThrow({
    where: { id: targetId },
    select: { categoryCode: true },
  });

  await tx.detection.create({
    data: { findingId: targetId, ...detectionData },
  });

  const all = await tx.detection.findMany({
    where: { findingId: targetId },
    select: { source: true, severity: true },
  });

  // Order-independent precedence: RAG's descriptive fields win, and the
  // category is the first one that is not "other" (RAG preferred when both are).
  const descriptive =
    d.source === "RAG"
      ? {
          title: f.title,
          file: f.file,
          lineStart: f.lineStart,
          lineEnd: f.lineEnd,
          contractName: f.contractName,
          functionName: f.functionName,
          categoryCode:
            f.categoryCode !== "other" ? f.categoryCode : existing.categoryCode,
        }
      : {
          categoryCode:
            existing.categoryCode === "other"
              ? f.categoryCode
              : existing.categoryCode,
        };

  await tx.finding.update({
    where: { id: targetId },
    data: {
      severity: highestSeverity(all.map((x) => x.severity)),
      detectedBy: buildDetectedBy(all.map((x) => x.source)),
      ...descriptive,
    },
  });

  return { findingId: targetId, merged: true };
}

/**
 * Recomputes a finding from the detections it currently has. Used after a stage
 * is reposted and some detections were deleted. Same precedence as attachDetection:
 * RAG supplies the descriptive fields, static is the fallback.
 */
export async function refreshFinding(
  tx: Prisma.TransactionClient,
  findingId: string,
): Promise<void> {
  const detections = await tx.detection.findMany({
    where: { findingId },
    select: { source: true, severity: true, raw: true },
  });
  if (detections.length === 0) return;

  const rag = detections.find((d) => d.source === "RAG");
  const stat = detections.find((d) => d.source === "SLITHER");
  const ragFields = rag
    ? mapRagHypothesis(rag.raw as unknown as RagHypothesis).finding
    : null;
  const statFields = stat
    ? mapStaticFinding(stat.raw as unknown as StaticFinding).finding
    : null;
  const primary = (ragFields ?? statFields)!;
  const categoryCode =
    [ragFields?.categoryCode, statFields?.categoryCode].find(
      (c) => c && c !== "other",
    ) ?? primary.categoryCode;

  await tx.finding.update({
    where: { id: findingId },
    data: {
      title: primary.title,
      categoryCode,
      severity: highestSeverity(detections.map((d) => d.severity)),
      detectedBy: buildDetectedBy(detections.map((d) => d.source)),
      file: primary.file,
      lineStart: primary.lineStart,
      lineEnd: primary.lineEnd,
      contractName: primary.contractName,
      functionName: primary.functionName,
    },
  });
}
