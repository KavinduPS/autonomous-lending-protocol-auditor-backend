import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// ASSUMPTION (README section 5, unconfirmed with EPA owner): exploit_code is a
// complete Foundry test file — a contract inheriting `Test` with a `testExploit()`
// function. If EPA instead sends a bare contract with no Test harness, this file
// needs a wrapper step added before writing to disk. Confirm before integration.
const FORGE_TIMEOUT_MS = 120_000; // 2 minutes

const FOUNDRY_PROJECT_TEMPLATE = path.join(
  __dirname,
  "..",
  "..",
  "foundry-template",
);

export async function runForgeTest(
  exploitCode: string,
  forkUrl: string,
): Promise<{ raw: string; exitCode: number }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "exploit-run-"));

  try {
    await copyDir(FOUNDRY_PROJECT_TEMPLATE, tempDir);
    await fs.writeFile(
      path.join(tempDir, "test", "Exploit.t.sol"),
      exploitCode,
    );

    const { raw, exitCode } = await runForgeProcess(tempDir, forkUrl);
    return { raw, exitCode };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runForgeProcess(
  cwd: string,
  forkUrl: string,
): Promise<{ raw: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const forgeProcess = spawn(
      "forge",
      ["test", "--fork-url", forkUrl, "-vvvvv"],
      { cwd },
    );

    let output = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        forgeProcess.kill();
        reject(
          new Error(
            `Forge test did not complete within ${FORGE_TIMEOUT_MS}ms — possible infinite loop or hang in exploit code`,
          ),
        );
      }
    }, FORGE_TIMEOUT_MS);

    forgeProcess.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    forgeProcess.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    forgeProcess.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    forgeProcess.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ raw: output, exitCode: code ?? -1 });
      }
    });
  });
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.cp(src, dest, { recursive: true });
}

export function parseForgeOutput(raw: string): {
  status: "success" | "failed" | "revert";
  revert_reason: string | null;
} {
  if (raw.includes("[PASS]")) {
    return { status: "success", revert_reason: null };
  }

  const failMatch = raw.match(/\[FAIL:\s*(.+?)\]/);
  if (failMatch) {
    return { status: "revert", revert_reason: failMatch[1].trim() };
  }

  // Neither [PASS] nor [FAIL: ...] found — forge errored before running the
  // test at all (compile error, missing fork URL, etc).
  return {
    status: "failed",
    revert_reason:
      "no [PASS]/[FAIL] marker found in forge output — see execution_trace",
  };
}
