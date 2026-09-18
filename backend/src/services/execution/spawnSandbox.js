import { spawn } from "node:child_process";

const MAX_STDOUT_BYTES = 32 * 1024 * 1024;

export class ExecutionUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.status = 503;
  }
}

// Starts a sandbox process, sends the JSON payload on stdin and parses the
// single JSON object the harness prints. The Node server never runs user code
// itself; it only talks to the sandbox through this pipe.
export function spawnSandbox({ command, args, payload, timeoutMs, onTimeout }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch (error) {
      reject(new ExecutionUnavailableError(`Could not start sandbox (${command}): ${error.message}`));
      return;
    }

    const stdout = [];
    let stdoutBytes = 0;
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        child.kill("SIGKILL");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8000) stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      const hint = error.code === "ENOENT" ? ` — "${command}" was not found` : "";
      reject(new ExecutionUnavailableError(`Sandbox failed to start${hint}: ${error.message}`));
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new ExecutionUnavailableError(`Sandbox did not finish within ${Math.round(timeoutMs / 1000)}s`));
        return;
      }

      const text = Buffer.concat(stdout).toString("utf8").trim();
      try {
        const result = JSON.parse(text);
        if (result.internalError) {
          reject(new ExecutionUnavailableError(`Sandbox harness error: ${result.internalError}`));
          return;
        }
        resolve(result);
      } catch {
        const details = (stderr || text).trim().slice(0, 1500) || `exit code ${exitCode}`;
        reject(new ExecutionUnavailableError(`Sandbox returned an invalid response: ${details}`));
      }
    });

    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}
