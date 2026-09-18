import path from "node:path";
import { env } from "../../../config/env.js";
import { spawnSandbox } from "../spawnSandbox.js";
import { SANDBOX_DIR } from "../paths.js";

// Linux namespace jail (sandbox/wsl/sandbox.sh): no network, private /tmp,
// host directories hidden, unprivileged user, rlimits per test.
// On Windows it runs inside WSL; on Linux it runs directly.

function toWslPath(windowsPath) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) return windowsPath.replace(/\\/g, "/");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

export const namespaceProvider = {
  name: "namespace",
  description:
    process.platform === "win32"
      ? `Linux namespace sandbox via WSL (${env.execution.wslDistro})`
      : "Linux namespace sandbox",

  run({ language, payload, timeoutMs }) {
    const script = path.join(SANDBOX_DIR, "wsl", "sandbox.sh");
    const runner = path.join(SANDBOX_DIR, language, "runner.py");

    if (process.platform === "win32") {
      return spawnSandbox({
        command: "wsl.exe",
        args: ["-d", env.execution.wslDistro, "--exec", "sh", toWslPath(script), toWslPath(runner)],
        payload,
        timeoutMs,
      });
    }
    return spawnSandbox({ command: "sh", args: [script, runner], payload, timeoutMs });
  },
};
