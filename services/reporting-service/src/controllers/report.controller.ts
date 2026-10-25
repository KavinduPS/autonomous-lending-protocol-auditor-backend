import { Request, Response } from "express";
import { prisma } from "../config/db.js";
import type { Severity } from "../generated/prisma/client.js";

const SEVERITY_ORDER: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];

export async function getReport(req: Request, res: Response) {
  try {
    const auditId = String(req.params.auditId);

    const audit = await prisma.audit.findFirst({
      where: { id: auditId, userId: (req as any).userId, deletedAt: null },
      include: { stages: true },
    });
    if (!audit) return res.status(404).json({ message: "Audit not found" });

    const header = {
      audit: {
        id: audit.id,
        contractName: audit.contractName,
        status: audit.status,
        errorMessage: audit.errorMessage,
        createdAt: audit.createdAt,
        completedAt: audit.completedAt,
      },
      stages: audit.stages.map((s) => ({ stage: s.stage, status: s.status })),
    };

    if (audit.status !== "COMPLETE") {
      return res.json({ ...header, findings: [] });
    }

    const found = await prisma.finding.findMany({
      where: { auditId },
      include: { category: true, detections: true, exploitAttempts: true },
    });

    found.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

    const summary = Object.fromEntries(
      SEVERITY_ORDER.map((s) => [s, 0]),
    ) as Record<Severity, number>;
    for (const f of found) summary[f.severity]++;

    const findings = found.map((f) => {
      const detection = (source: "SLITHER" | "RAG") => {
        const d = f.detections.find((x) => x.source === source);
        if (!d) return null;
        const { raw, id, findingId, ...rest } = d;
        return rest;
      };
      const lastAttempt = [...f.exploitAttempts].sort(
        (a, b) => b.attemptNo - a.attemptNo,
      )[0];

      return {
        id: f.id,
        title: f.title,
        category: { code: f.category.code, name: f.category.name },
        severity: f.severity,
        verificationStatus: f.verificationStatus,
        components: {
          staticAnalysis: detection("SLITHER"),
          ragLlm: detection("RAG"),
          epa: lastAttempt
            ? {
                outcome: lastAttempt.outcome,
                attempts: f.exploitAttempts.length,
                evidence: lastAttempt.evidence,
              }
            : null,
        },
      };
    });

    return res.json({
      ...header,
      baseline: audit.baseline,
      summary,
      totalFindings: findings.length,
      findings,
    });
  } catch (err) {
    console.error("getReport failed:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
