import {
  PROFIT_NOTE,
  compareFindings,
  computeVsBaseline,
  parseBaseline,
  parseRun,
  pickBestAttempt,
  simulationLabel,
  type ReportAudit,
  type ReportDetection,
} from "./report.builder.js";

function ragScore(raw: unknown): number | null {
  const v =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).confidence
      : null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function staticSide(d: ReportDetection | undefined) {
  if (!d) return null;
  return {
    ruleId: d.ruleId,
    severity: d.severity,
    confidence: d.confidence,
    description: d.description,
  };
}

function ragSide(d: ReportDetection | undefined) {
  if (!d) return null;
  return {
    severity: d.severity,
    confidence: d.confidence,
    confidenceScore: ragScore(d.raw),
    description: d.description,
  };
}

function stageStatus(audit: ReportAudit, name: string): string | null {
  return audit.stages.find((s) => s.stage === name)?.status ?? null;
}

/**
 * The three-way comparison for one audit: normal execution (baseline),
 * static vs RAG, and exploit simulation. Works at any audit status; a section
 * with no data returns available: false and a reason.
 */
export function buildComparison(
  audit: ReportAudit,
  opts: { findingId?: string } = {},
) {
  const findings = audit.findings
    .filter((f) => !opts.findingId || f.id === opts.findingId)
    .sort(compareFindings);
  const baseline = parseBaseline(audit.baseline);

  // ----- 1. normal execution -----
  const normalExecution = baseline
    ? {
        available: true,
        reason: null as string | null,
        baseline,
        links: { trace: `/api/reports/${audit.id}/simulations/baseline` },
      }
    : {
        available: false,
        reason: "Baseline execution has not been recorded yet" as string | null,
        baseline: null,
        links: null,
      };

  // ----- 2. static vs RAG -----
  const missing = ["STATIC", "RAG"].filter(
    (s) => stageStatus(audit, s) !== "COMPLETE",
  );
  let staticVsRag;
  if (missing.length > 0) {
    staticVsRag = {
      available: false,
      reason: `${missing.join(" and ")} stage${missing.length > 1 ? "s" : ""} not complete`,
      summary: null,
      findings: [],
    };
  } else {
    const rows = findings
      .map((f) => {
        const stat = f.detections.find((d) => d.source === "SLITHER");
        const rag = f.detections.find((d) => d.source === "RAG");
        if (!stat && !rag) return null;
        return {
          findingId: f.id,
          title: f.title,
          category: f.category.code,
          finalSeverity: f.severity,
          location: {
            file: f.file,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
          },
          agreement:
            stat && rag
              ? ("BOTH" as const)
              : stat
                ? ("STATIC_ONLY" as const)
                : ("RAG_ONLY" as const),
          severityMatch: stat && rag ? stat.severity === rag.severity : null,
          static: staticSide(stat),
          rag: ragSide(rag),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    staticVsRag = {
      available: true,
      reason: null as string | null,
      summary: {
        totalFindings: rows.length,
        staticOnly: rows.filter((r) => r.agreement === "STATIC_ONLY").length,
        ragOnly: rows.filter((r) => r.agreement === "RAG_ONLY").length,
        both: rows.filter((r) => r.agreement === "BOTH").length,
        severityMatches: rows.filter((r) => r.severityMatch === true).length,
        severityMismatches: rows.filter((r) => r.severityMatch === false)
          .length,
      },
      findings: rows,
    };
  }

  // ----- 3. exploit simulation -----
  const simulationStarted =
    audit.stages.some((s) => s.stage === "SIMULATION") ||
    audit.findings.some(
      (f) => f.triageDecision != null || f.exploitAttempts.length > 0,
    );

  let exploitSimulation;
  if (!simulationStarted) {
    exploitSimulation = {
      available: false,
      reason: "Simulation has not started" as string | null,
      summary: null,
      findings: [],
    };
  } else {
    const counts = {
      confirmed: 0,
      notConfirmed: 0,
      couldNotRun: 0,
      skipped: 0,
      notTested: 0,
    };
    let sentToSimulation = 0;

    const rows = findings.map((f) => {
      const label = simulationLabel(f);
      if (label === "Confirmed") counts.confirmed++;
      else if (label === "Not confirmed") counts.notConfirmed++;
      else if (label === "Could not run") counts.couldNotRun++;
      else if (label === "Skipped") counts.skipped++;
      else counts.notTested++;
      if (f.triageDecision === "SIMULATE" || f.exploitAttempts.length > 0) {
        sentToSimulation++;
      }

      const attempts = [...f.exploitAttempts]
        .sort((a, b) => a.attemptNo - b.attemptNo)
        .map((a) => ({
          id: a.id,
          attemptNo: a.attemptNo,
          outcome: a.outcome,
          run: parseRun(a.evidence),
        }));
      const best = pickBestAttempt(attempts);

      return {
        findingId: f.id,
        title: f.title,
        severity: f.severity,
        label,
        triage: f.triageDecision
          ? {
              decision: f.triageDecision,
              score:
                f.triageScore != null ? Number(String(f.triageScore)) : null,
              reason: f.triageReason,
            }
          : null,
        attempts: attempts.map((a) => ({
          id: a.id,
          attemptNo: a.attemptNo,
          outcome: a.outcome,
          ...a.run,
          link: `/api/reports/${audit.id}/simulations/${a.id}`,
        })),
        vsBaseline: computeVsBaseline(baseline, best),
      };
    });

    exploitSimulation = {
      available: true,
      reason: null as string | null,
      summary: { sentToSimulation, ...counts },
      findings: rows,
    };
  }

  return {
    audit: {
      id: audit.id,
      contractName: audit.contractName,
      status: audit.status,
    },
    normalExecution,
    staticVsRag,
    exploitSimulation,
    notes: [PROFIT_NOTE],
  };
}
