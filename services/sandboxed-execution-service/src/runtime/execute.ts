import { ExecutionInput, ExecutionResult } from "./types";
import { allocatePort, releasePort } from "./ports";
import { startAnvilFork, stopAnvil } from "./anvil";
import { runForgeTest, parseForgeOutput } from "./forge";
import { getAttackerBalance, measureProfit } from "./profit";
import { ChildProcess } from "child_process";

export async function runExecution(
  input: ExecutionInput,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const port = allocatePort();
  let anvilProcess: ChildProcess | null = null;

  try {
    anvilProcess = await startAnvilFork(input.chain, input.block_number, port);
    const forkUrl = `http://127.0.0.1:${port}`;

    const beforeBalance = await getAttackerBalance(forkUrl);
    const { raw, exitCode } = await runForgeTest(input.exploit_code, forkUrl);
    const profit_native = await measureProfit(forkUrl, beforeBalance);

    const { status, revert_reason } = parseForgeOutput(raw);

    const gasMatches = [...raw.matchAll(/gas:\s*(\d+)/g)];
    const gas_used = gasMatches.reduce(
      (sum, match) => sum + parseInt(match[1], 10),
      0,
    );

    return {
      status,
      revert_reason,
      profit_native,
      gas_used,
      execution_trace: raw,
      duration_ms: Date.now() - startTime,
    };
  } finally {
    if (anvilProcess) {
      stopAnvil(anvilProcess);
    }
    releasePort(port);
  }
}
