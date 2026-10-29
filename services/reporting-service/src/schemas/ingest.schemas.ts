import { z } from "zod";

// ---------- helpers ----------

const STATIC_SEVERITIES = [
  "high",
  "medium",
  "low",
  "informational",
  "optimization",
];
const STATIC_CONFIDENCES = ["high", "medium", "low"];
const RAG_SEVERITIES = ["critical", "high", "medium", "low"];

function oneOfIgnoreCase(values: string[], label: string) {
  return z.string().refine((v) => values.includes(v.trim().toLowerCase()), {
    message: `${label} must be one of: ${values.join(", ")}`,
  });
}

/** Turns a zod error into the list returned in a 400 response. */
export function formatIssues(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return error.issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
}

// ---------- POST /internal/audits ----------

export const createAuditSchema = z.object({
  audit_id: z.string().trim().min(1).max(128),
  user_id: z.string().trim().min(1).max(128),
  contract_name: z.string().trim().min(1).max(200),
  source_uri: z.string().trim().min(1).max(2000),
  chain: z.string().trim().min(1).max(64).nullish(),
  block_number: z.number().int().nonnegative().nullish(),
});

// ---------- POST /internal/audits/:id/static ----------
// The static service's AnalysisResponse, unchanged.

const staticLocationSchema = z
  .object({
    file: z.string().nullish(),
    start_line: z.number().int().nonnegative().nullish(),
    end_line: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

const staticFindingSchema = z
  .object({
    finding_id: z.string().min(1),
    tool_finding_id: z.string().optional(),
    tool: z.string().optional(),
    rule_id: z.string().min(1),
    description: z.string(),
    severity: oneOfIgnoreCase(STATIC_SEVERITIES, "severity"),
    confidence: oneOfIgnoreCase(STATIC_CONFIDENCES, "confidence"),
    reference: z.string().nullish(),
    locations: z.array(staticLocationSchema).default([]),
  })
  .passthrough();

export const staticIngestSchema = z
  .object({
    audit_id: z.string().optional(), // ignored, the URL id is the one we trust
    status: z.literal("completed"),
    finding_count: z.number().int().nonnegative().optional(),
    metadata: z
      .object({
        source_sha256: z.string().nullish(),
        slither_version: z.string().nullish(),
        compiler_version: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    findings: z.array(staticFindingSchema).max(2000),
  })
  .passthrough();

// ---------- POST /internal/audits/:id/rag ----------
// The RAG service's AnalysisResponse, unchanged.

const ragHypothesisSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    location: z
      .object({
        file: z.string().nullish(),
        contract: z.string().nullish(),
        function: z.string().nullish(),
        lines: z.array(z.number().int().nonnegative()).nullish(),
      })
      .passthrough()
      .optional(),
    vuln_class: z.string().min(1), // unknown classes fall back to "other" in the mapper
    reason: z.string(),
    confidence: z.number().min(0).max(1),
    severity: oneOfIgnoreCase(RAG_SEVERITIES, "severity"),
  })
  .passthrough();

export const ragIngestSchema = z
  .object({
    audit_id: z.string().optional(),
    status: z.literal("completed"),
    context: z.unknown().optional(),
    hypotheses: z.array(ragHypothesisSchema).max(500),
    error: z.string().nullish(),
  })
  .passthrough();

// ---------- POST /internal/audits/:id/ ----------

const triageDecisionSchema = z
  .object({
    finding_ref: z.string().min(1).optional(),
    finding_id: z.string().min(1).optional(),
    decision: z.enum(["SIMULATE", "SKIP"]),
    score: z.number().min(0).max(1).nullish(),
    reason: z.string().max(2000).nullish(),
  })
  .refine((d) => Boolean(d.finding_ref || d.finding_id), {
    message: "finding_ref or finding_id is required",
    path: ["finding_ref"],
  });

export const triageSchema = z.object({
  decisions: z.array(triageDecisionSchema).min(1).max(2000),
});

// ---------- POST /internal/audits/:id/simulation ----------

const executionResultSchema = z
  .object({
    status: z.enum(["success", "failed", "revert"]),
    revert_reason: z.string().nullish(),
    profit_native: z.number(),
    gas_used: z.number().int().nonnegative(),
    execution_trace: z.string().max(2_000_000).default(""),
    duration_ms: z.number().nonnegative(),
  })
  .passthrough();

const baselineBodySchema = z.object({
  mode: z.literal("baseline"),
  result: executionResultSchema,
});

const attemptBodySchema = z.object({
  mode: z.literal("exploit_attempt"),
  finding_ref: z.string().min(1).optional(),
  finding_id: z.string().min(1).optional(),
  attempt_no: z.number().int().positive().optional(),
  exploit_code: z.string().min(1).max(200_000),
  result: executionResultSchema,
});

export const simulationSchema = z
  .discriminatedUnion("mode", [baselineBodySchema, attemptBodySchema])
  .superRefine((v, ctx) => {
    if (v.mode === "exploit_attempt" && !v.finding_ref && !v.finding_id) {
      ctx.addIssue({
        code: "custom",
        message: "finding_ref or finding_id is required for exploit_attempt",
        path: ["finding_ref"],
      });
    }
  });

// ---------- POST /internal/audits/:id/complete ----------

export const completeSchema = z.object({
  status: z.enum(["COMPLETE", "FAILED"]),
  error_message: z.string().max(2000).nullish(),
});

// ---------- inferred types ----------

export type CreateAuditBody = z.infer<typeof createAuditSchema>;
export type StaticIngestBody = z.infer<typeof staticIngestSchema>;
export type RagIngestBody = z.infer<typeof ragIngestSchema>;
export type TriageBody = z.infer<typeof triageSchema>;
export type SimulationBody = z.infer<typeof simulationSchema>;
export type CompleteBody = z.infer<typeof completeSchema>;
export type ExecutionResultBody = z.infer<typeof executionResultSchema>;
