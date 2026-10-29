import type { Request, Response } from "express";
import {
  completeSchema,
  createAuditSchema,
  formatIssues,
  ragIngestSchema,
  simulationSchema,
  staticIngestSchema,
  triageSchema,
} from "../schemas/ingest.schemas.js";
import { MappingError } from "../lib/mappers.js";
import {
  completeAudit,
  createAudit,
  IngestError,
  ingestRag,
  ingestSimulation,
  ingestStatic,
  ingestTriage,
} from "../services/ingest.service.js";

type Issues = Parameters<typeof formatIssues>[0];
type Parsed<T> = { success: true; data: T } | { success: false; error: Issues };

/** Validate the body, run the service function, map errors to HTTP statuses. */
function handle<T>(
  name: string,
  schema: { safeParse: (data: unknown) => Parsed<T> },
  run: (auditId: string, body: T) => Promise<unknown>,
  successStatus = 200,
) {
  return async (req: Request, res: Response) => {
    try {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid request body",
          errors: formatIssues(parsed.error),
        });
      }
      const result = await run(String(req.params.auditId ?? ""), parsed.data);
      return res.status(successStatus).json(result);
    } catch (err) {
      if (err instanceof IngestError) {
        return res.status(err.status).json({ message: err.message });
      }
      if (err instanceof MappingError) {
        return res.status(400).json({ message: err.message });
      }
      console.error(`${name} failed:`, err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

export const postCreateAudit = handle(
  "createAudit",
  createAuditSchema,
  (_auditId, body) => createAudit(body),
  201,
);
export const postStatic = handle(
  "ingestStatic",
  staticIngestSchema,
  ingestStatic,
);
export const postRag = handle("ingestRag", ragIngestSchema, ingestRag);
export const postTriage = handle("ingestTriage", triageSchema, ingestTriage);
export const postSimulation = handle(
  "ingestSimulation",
  simulationSchema,
  ingestSimulation,
);
export const postComplete = handle(
  "completeAudit",
  completeSchema,
  completeAudit,
);
