import { spawn, ChildProcess } from "child_process";

const RPC_URLS: Record<string, string | undefined> = {
  ethereum: process.env.ETH_RPC_URL,
  bsc: process.env.BSC_RPC_URL,
};

const STARTUP_TIMEOUT_MS = 30_000;

export function startAnvilFork(
  chain: string,
  blockNumber: number,
  port: number,
): Promise<ChildProcess> {
  const rpcUrl = RPC_URLS[chain];
  if (!rpcUrl) {
    return Promise.reject(
      new Error(
        `No RPC URL configured for chain "${chain}" — check ETH_RPC_URL / BSC_RPC_URL env vars`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const anvilProcess = spawn("anvil", [
      "--fork-url",
      rpcUrl,
      "--fork-block-number",
      blockNumber.toString(),
      "--port",
      port.toString(),
    ]);

    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        anvilProcess.kill();
        reject(
          new Error(
            `Anvil did not start listening within ${STARTUP_TIMEOUT_MS}ms (port ${port})`,
          ),
        );
      }
    }, STARTUP_TIMEOUT_MS);

    anvilProcess.stdout?.on("data", (data: Buffer) => {
      if (!settled && data.toString().includes("Listening on")) {
        settled = true;
        clearTimeout(timeout);
        resolve(anvilProcess);
      }
    });

    anvilProcess.stderr?.on("data", (data: Buffer) => {
      // Anvil writes some startup info to stderr too; don't fail on it alone,
      // but surface it for debugging if startup never succeeds.
      console.error(`[anvil stderr, port ${port}]: ${data.toString()}`);
    });

    anvilProcess.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    anvilProcess.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Anvil exited before becoming ready (code ${code}, port ${port})`,
          ),
        );
      }
    });
  });
}

export function stopAnvil(anvilProcess: ChildProcess): void {
  anvilProcess.kill();
}
