import { runExecution } from "../runtime/execute.js";
import { ExecutionInput, ExecutionResult } from "../runtime/types.js";
import { prisma } from "../db/client.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateExecutionInput(
  input: any,
): asserts input is ExecutionInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Request body must be a valid JSON object");
  }

  if (
    !input.audit_id ||
    typeof input.audit_id !== "string" ||
    input.audit_id.trim() === ""
  ) {
    throw new ValidationError(
      "Missing or invalid field: 'audit_id' must be a non-empty string",
    );
  }

  if (
    !input.chain ||
    typeof input.chain !== "string" ||
    input.chain.trim() === ""
  ) {
    throw new ValidationError(
      "Missing or invalid field: 'chain' must be a non-empty string",
    );
  }

  if (
    input.block_number === undefined ||
    input.block_number === null ||
    typeof input.block_number !== "number" ||
    !Number.isInteger(input.block_number) ||
    input.block_number <= 0
  ) {
    throw new ValidationError(
      "Missing or invalid field: 'block_number' must be a positive integer",
    );
  }

  if (
    !input.exploit_code ||
    typeof input.exploit_code !== "string" ||
    input.exploit_code.trim() === ""
  ) {
    throw new ValidationError(
      "Missing or invalid field: 'exploit_code' must be a non-empty string",
    );
  }

  if (input.mode !== "baseline" && input.mode !== "exploit_attempt") {
    throw new ValidationError(
      "Missing or invalid field: 'mode' must be either 'baseline' or 'exploit_attempt'",
    );
  }
}

export async function handleExecuteRequest(
  input: ExecutionInput,
): Promise<ExecutionResult> {
  validateExecutionInput(input);

  const result = await runExecution(input);

  await prisma.executionRun.create({
    data: {
      auditId: input.audit_id,
      mode: input.mode,
      chain: input.chain,
      blockNumber: input.block_number,
      status: result.status,
      revertReason: result.revert_reason,
      profitNative: result.profit_native,
      gasUsed: result.gas_used,
      executionTrace: result.execution_trace,
      durationMs: result.duration_ms,
    },
  });

  return result;
}
