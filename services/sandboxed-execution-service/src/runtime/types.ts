export interface ExecutionInput {
  audit_id: string;
  chain: string; // "ethereum" | "bsc" for now
  block_number: number;
  exploit_code: string; // full Solidity source — a Foundry test file (see README section 5)
  mode: "baseline" | "exploit_attempt";
}

export interface ExecutionResult {
  status: "success" | "failed" | "revert";
  revert_reason: string | null;
  profit_native: number; // ETH or BNB delta
  gas_used: number;
  execution_trace: string; // raw forge output, truncate if huge
  duration_ms: number;
}
