import { ExecutionInput, ExecutionResult } from "./types";

// MOCK — replaced with real Anvil/Forge orchestration on feature/execution-runtime.
// Signature is frozen: do not change without checking with Person B first.
export async function runExecutifon(
  input: ExecutionInput,
): Promise<ExecutionResult> {
  return {
    status: "success",
    revert_reason: null,
    profit_native: 1.5,
    gas_used: 210000,
    execution_trace: `mock trace — real execution not implemented yet (mode: ${input.mode})`,
    duration_ms: 100,
  };
}
