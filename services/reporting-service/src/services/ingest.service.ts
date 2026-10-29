import type {
  DetectionSource,
  ExploitOutcome,
  Prisma,
  StageName,
  StageStatus,
  VerificationStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../config/db.js";
import {
  mapRagHypothesis,
  mapStaticFinding,
  type MappedItem,
} from "../lib/mappers.js";
import { attachDetection, refreshFinding } from "./merge.service.js";
import type {
  CompleteBody,
  CreateAuditBody,
  RagIngestBody,
  SimulationBody,
  StaticIngestBody,
  TriageBody,
} from "../schemas/ingest.schemas.js";

type Tx = Prisma.TransactionClient;

// Interactive transactions time out after 5s by default, too short for big audits.
const TX = { timeout: 60_000, maxWait: 10_000 };

/** The controller (step 8) turns this into an HTTP status. */
export class IngestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

// ---------- pure helpers ----------

export function outcomeFromStatus(
  status: "success" | "failed" | "revert",
): ExploitOutcome {
  if (status === "success") return "CONFIRMED";
  if (status === "revert") return "NOT_CONFIRMED";
  return "ERROR";
}

/** CONFIRMED if any attempt is, else NOT_CONFIRMED if any is, else UNVERIFIED. */
export function computeVerification(
  outcomes: ExploitOutcome[],
): VerificationStatus {
  if (outcomes.includes("CONFIRMED")) return "CONFIRMED";
  if (outcomes.includes("NOT_CONFIRMED")) return "NOT_CONFIRMED";
  return "UNVERIFIED";
}

// ---------- database helpers ----------

async function loadAudit(tx: Tx, auditId: string) {
  const audit = await tx.audit.findFirst({
    where: { id: auditId, deletedAt: null },
  });
  if (!audit) throw new IngestError(404, "Audit not found");
  return audit;
}

function markAnalyzing(tx: Tx, auditId: string) {
  return tx.audit.updateMany({
    where: { id: auditId, status: "PENDING" },
    data: { status: "ANALYZING" },
  });
}

function upsertStage(
  tx: Tx,
  auditId: string,
  stage: StageName,
  status: StageStatus,
  metrics?: Prisma.InputJsonValue,
) {
  return tx.auditStage.upsert({
    where: { auditId_stage: { auditId, stage } },
    create: { auditId, stage, status, metrics },
    update: { status, ...(metrics !== undefined ? { metrics } : {}) },
  });
}

/** Finds our finding from a finding_id, or from the other service's own id. */
async function resolveFinding(
  tx: Tx,
  auditId: string,
  ref?: string,
  id?: string,
): Promise<string | null> {
  if (id) {
    const f = await tx.finding.findFirst({
      where: { id, auditId },
      select: { id: true },
    });
    if (f) return f.id;
  }
  if (ref) {
    const d = await tx.detection.findFirst({
      where: { sourceRef: ref, finding: { auditId } },
      select: { findingId: true },
    });
    if (d) return d.findingId;
  }
  return null;
}

/**
 * Replace semantics for one source: delete its detections, drop findings left
 * with nothing, repair the findings that lost a detection, then merge the new items.
 */
async function replaceSource(
  tx: Tx,
  auditId: string,
  source: DetectionSource,
  items: MappedItem[],
) {
  const affected = await tx.detection.findMany({
    where: { source, finding: { auditId } },
    select: { findingId: true },
  });
  await tx.detection.deleteMany({ where: { source, finding: { auditId } } });
  await tx.finding.deleteMany({
    where: {
      auditId,
      detections: { none: {} },
      exploitAttempts: { none: {} },
    },
  });
  for (const findingId of new Set(affected.map((a) => a.findingId))) {
    await refreshFinding(tx, findingId); // does nothing for deleted findings
  }

  let created = 0;
  let merged = 0;
  const seen = new Set<string>();
  for (const item of items) {
    const ref = item.detection.sourceRef;
    if (ref) {
      if (seen.has(ref)) continue; // duplicate id in one body: keep the first
      seen.add(ref);
    }
    const result = await attachDetection(tx, auditId, item);
    if (result.merged) merged++;
    else created++;
  }
  return { newFindings: created, mergedIntoExisting: merged };
}

// ---------- ingest functions ----------

export async function createAudit(body: CreateAuditBody) {
  const existing = await prisma.audit.findUnique({
    where: { id: body.audit_id },
    select: { id: true },
  });
  if (existing) throw new IngestError(409, "Audit already exists");

  await prisma.audit.create({
    data: {
      id: body.audit_id,
      userId: body.user_id,
      contractName: body.contract_name,
      sourceUri: body.source_uri,
      chain: body.chain ?? null,
      blockNumber: body.block_number ?? null,
    },
  });
  return { ok: true, auditId: body.audit_id };
}

export async function ingestStatic(auditId: string, body: StaticIngestBody) {
  // Mapping errors surface before anything is written.
  const items = body.findings.map((f) => mapStaticFinding(f));

  return prisma.$transaction(async (tx) => {
    await loadAudit(tx, auditId);
    const result = await replaceSource(tx, auditId, "SLITHER", items);

    await tx.audit.update({
      where: { id: auditId },
      data: {
        sourceSha256: body.metadata?.source_sha256 ?? undefined,
        slitherVersion: body.metadata?.slither_version ?? undefined,
        compilerVersion: body.metadata?.compiler_version ?? undefined,
      },
    });
    await upsertStage(tx, auditId, "STATIC", "COMPLETE", {
      source_sha256: body.metadata?.source_sha256 ?? null,
      slither_version: body.metadata?.slither_version ?? null,
      compiler_version: body.metadata?.compiler_version ?? null,
      finding_count: items.length,
    });
    await markAnalyzing(tx, auditId);
    return { ok: true, received: items.length, ...result };
  }, TX);
}

export async function ingestRag(auditId: string, body: RagIngestBody) {
  const items = body.hypotheses.map((h) => mapRagHypothesis(h));

  return prisma.$transaction(async (tx) => {
    await loadAudit(tx, auditId);
    const result = await replaceSource(tx, auditId, "RAG", items);
    await upsertStage(tx, auditId, "RAG", "COMPLETE", {
      hypothesis_count: items.length,
    });
    await markAnalyzing(tx, auditId);
    return { ok: true, received: items.length, ...result };
  }, TX);
}

export async function ingestTriage(auditId: string, body: TriageBody) {
  return prisma.$transaction(async (tx) => {
    await loadAudit(tx, auditId);

    let updated = 0;
    const unresolved: string[] = [];
    for (const d of body.decisions) {
      const findingId = await resolveFinding(
        tx,
        auditId,
        d.finding_ref,
        d.finding_id,
      );
      if (!findingId) {
        unresolved.push(d.finding_ref ?? d.finding_id ?? "unknown");
        continue;
      }
      await tx.finding.update({
        where: { id: findingId },
        data: {
          triageDecision: d.decision,
          triageScore: d.score ?? null,
          triageReason: d.reason ?? null,
        },
      });
      updated++;
    }
    await markAnalyzing(tx, auditId);
    return { ok: true, updated, unresolved };
  }, TX);
}

export async function ingestSimulation(
  auditId: string,
  body: SimulationBody,
): Promise<{
  ok: true;
  mode: "baseline" | "exploit_attempt";
  findingId?: string;
  attemptNo?: number;
  outcome?: ExploitOutcome;
  verificationStatus?: VerificationStatus;
}> {
  return prisma.$transaction(async (tx) => {
    const audit = await loadAudit(tx, auditId);
    const r = body.result;

    if (body.mode === "baseline") {
      await tx.audit.update({
        where: { id: auditId },
        data: {
          baseline: {
            chain: audit.chain,
            block_number: audit.blockNumber,
            status: r.status,
            revert_reason: r.revert_reason ?? null,
            profit_native: r.profit_native,
            gas_used: r.gas_used,
            duration_ms: r.duration_ms,
            execution_trace: r.execution_trace,
          },
        },
      });
      await tx.auditStage.upsert({
        where: { auditId_stage: { auditId, stage: "SIMULATION" } },
        create: { auditId, stage: "SIMULATION", status: "RUNNING" },
        update: {},
      });
      await markAnalyzing(tx, auditId);
      return { ok: true as const, mode: "baseline" as const };
    }

    const findingId = await resolveFinding(
      tx,
      auditId,
      body.finding_ref,
      body.finding_id,
    );
    if (!findingId) {
      throw new IngestError(404, "Finding not found for the given reference");
    }

    let attemptNo = body.attempt_no;
    if (attemptNo == null) {
      const last = await tx.exploitAttempt.aggregate({
        where: { findingId },
        _max: { attemptNo: true },
      });
      attemptNo = (last._max.attemptNo ?? 0) + 1;
    }

    const outcome = outcomeFromStatus(r.status);
    const data = {
      pocCode: body.exploit_code,
      outcome,
      evidence: {
        status: r.status,
        revert_reason: r.revert_reason ?? null,
        profit_native: r.profit_native,
        gas_used: r.gas_used,
        duration_ms: r.duration_ms,
      } as Prisma.InputJsonValue,
      environment: {
        chain: audit.chain,
        block_number: audit.blockNumber,
      } as Prisma.InputJsonValue,
      trace: r.execution_trace,
    };

    await tx.exploitAttempt.upsert({
      where: { findingId_attemptNo: { findingId, attemptNo } },
      create: { findingId, attemptNo, ...data },
      update: data,
    });

    const all = await tx.exploitAttempt.findMany({
      where: { findingId },
      select: { outcome: true },
    });
    const verificationStatus = computeVerification(all.map((a) => a.outcome));
    await tx.finding.update({
      where: { id: findingId },
      data: { verificationStatus },
    });

    await tx.auditStage.upsert({
      where: { auditId_stage: { auditId, stage: "SIMULATION" } },
      create: { auditId, stage: "SIMULATION", status: "RUNNING" },
      update: {},
    });
    await markAnalyzing(tx, auditId);

    return {
      ok: true as const,
      mode: "exploit_attempt" as const,
      findingId,
      attemptNo,
      outcome,
      verificationStatus,
    };
  }, TX);
}

export async function completeAudit(auditId: string, body: CompleteBody) {
  return prisma.$transaction(async (tx) => {
    await loadAudit(tx, auditId);

    if (body.status === "COMPLETE") {
      await tx.auditStage.updateMany({
        where: { auditId, status: "RUNNING" },
        data: { status: "COMPLETE" },
      });
      await tx.audit.update({
        where: { id: auditId },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    } else {
      await tx.auditStage.updateMany({
        where: { auditId, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: "FAILED" },
      });
      await tx.audit.update({
        where: { id: auditId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: body.error_message ?? "Audit failed",
        },
      });
    }
    return { ok: true, status: body.status };
  }, TX);
}
