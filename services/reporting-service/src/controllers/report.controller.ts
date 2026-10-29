import type { Request, Response } from "express";
import { prisma } from "../config/db.js";
import { SEVERITY_LEVELS } from "../constants/severityLevels.js";
import { SEVERITY_ORDER } from "../lib/mappers.js";
import { buildComparison } from "../services/comparison.builder.js";
import { buildFullReport } from "../services/report.builder.js";

const FULL_INCLUDE = {
  stages: true,
  findings: {
    include: { category: true, detections: true, exploitAttempts: true },
  },
} as const;

function userOr401(req: Request, res: Response): string | null {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "Missing x-user-id" });
    return null;
  }
  return userId;
}

function serverError(res: Response, name: string, err: unknown) {
  console.error(`${name} failed:`, err);
  return res.status(500).json({ message: "Internal server error" });
}

export async function getReport(req: Request, res: Response) {
  try {
    const userId = userOr401(req, res);
    if (!userId) return;
    const audit = await prisma.audit.findFirst({
      where: { id: String(req.params.auditId), userId, deletedAt: null },
      include: FULL_INCLUDE,
    });
    if (!audit) return res.status(404).json({ message: "Audit not found" });
    return res.json(buildFullReport(audit));
  } catch (err) {
    return serverError(res, "getReport", err);
  }
}

export async function getComparison(req: Request, res: Response) {
  try {
    const userId = userOr401(req, res);
    if (!userId) return;
    const audit = await prisma.audit.findFirst({
      where: { id: String(req.params.auditId), userId, deletedAt: null },
      include: FULL_INCLUDE,
    });
    if (!audit) return res.status(404).json({ message: "Audit not found" });

    const findingId =
      typeof req.query.findingId === "string" ? req.query.findingId : undefined;
    if (findingId && !audit.findings.some((f) => f.id === findingId)) {
      return res.status(404).json({ message: "Finding not found" });
    }
    return res.json(buildComparison(audit, { findingId }));
  } catch (err) {
    return serverError(res, "getComparison", err);
  }
}

export async function listReports(req: Request, res: Response) {
  try {
    const userId = userOr401(req, res);
    if (!userId) return;
    const audits = await prisma.audit.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        contractName: true,
        status: true,
        createdAt: true,
        completedAt: true,
        findings: { select: { severity: true } },
      },
    });

    return res.json({
      audits: audits.map((a) => {
        const severityCounts = Object.fromEntries(
          SEVERITY_ORDER.map((s) => [s, 0]),
        ) as Record<string, number>;
        for (const f of a.findings) severityCounts[f.severity]++;
        return {
          id: a.id,
          contractName: a.contractName,
          status: a.status,
          createdAt: a.createdAt,
          completedAt: a.completedAt,
          totalFindings: a.findings.length,
          severityCounts,
        };
      }),
    });
  } catch (err) {
    return serverError(res, "listReports", err);
  }
}

export function getSeverityLevels(_req: Request, res: Response) {
  return res.json({ levels: SEVERITY_LEVELS });
}

export async function getFinding(req: Request, res: Response) {
  try {
    const userId = userOr401(req, res);
    if (!userId) return;
    const auditId = String(req.params.auditId);
    const f = await prisma.finding.findFirst({
      where: {
        id: String(req.params.findingId),
        auditId,
        audit: { userId, deletedAt: null },
      },
      include: {
        category: true,
        detections: true,
        exploitAttempts: {
          orderBy: { attemptNo: "asc" },
          select: {
            id: true,
            attemptNo: true,
            outcome: true,
            evidence: true,
            environment: true,
          },
        },
      },
    });
    if (!f) return res.status(404).json({ message: "Finding not found" });

    return res.json({
      id: f.id,
      title: f.title,
      category: { code: f.category.code, name: f.category.name },
      severity: f.severity,
      verificationStatus: f.verificationStatus,
      detectedBy: f.detectedBy,
      location: {
        file: f.file,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        contract: f.contractName,
        function: f.functionName,
      },
      triage: f.triageDecision
        ? {
            decision: f.triageDecision,
            score: f.triageScore != null ? Number(String(f.triageScore)) : null,
            reason: f.triageReason,
          }
        : null,
      recommendation: f.category.defaultMitigation,
      detections: f.detections, // includes raw
      attempts: f.exploitAttempts.map((a) => ({
        ...a,
        link: `/api/reports/${auditId}/simulations/${a.id}`,
      })),
    });
  } catch (err) {
    return serverError(res, "getFinding", err);
  }
}

export async function getBaselineRun(req: Request, res: Response) {
  try {
    const userId = userOr401(req, res);
    if (!userId) return;
    const audit = await prisma.audit.findFirst({
      where: { id: String(req.params.auditId), userId, deletedAt: null },
      select: { baseline: true },
    });
    if (!audit) return res.status(404).json({ message: "Audit not found" });
    if (!audit.baseline) {
      return res.status(404).json({ message: "No baseline recorded" });
    }
    return res.json({ baseline: audit.baseline }); // includes the trace
  } catch (err) {
    return serverError(res, "getBaselineRun", err);
  }
}

export async function getAttemptRun(req: Request, res: Response) {
  try {
    const userId = userOr401(req, res);
    if (!userId) return;
    const attempt = await prisma.exploitAttempt.findFirst({
      where: {
        id: String(req.params.attemptId),
        finding: {
          auditId: String(req.params.auditId),
          audit: { userId, deletedAt: null },
        },
      },
      include: { finding: { select: { id: true, title: true } } },
    });
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    return res.json(attempt); // includes exploit code and trace
  } catch (err) {
    return serverError(res, "getAttemptRun", err);
  }
}
