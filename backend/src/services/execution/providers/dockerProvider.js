import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { env } from "../../../config/env.js";
import { spawnSandbox } from "../spawnSandbox.js";

// One short-lived container per run, built from sandbox/<language>/Dockerfile:
//   docker build -t dsaforge-python-runner sandbox/python
// DOCKER_COMMAND may contain a prefix, e.g. "wsl -d Ubuntu docker".

export const dockerProvider = {
  name: "docker",
  description: "Docker container sandbox",

  run({ language, payload, timeoutMs }) {
    const [command, ...prefixArgs] = env.execution.dockerCommand.split(/\s+/).filter(Boolean);
    const containerName = `dsaforge-run-${randomUUID()}`;
    const memoryMb = payload.memoryLimitMb + 64; // harness overhead

    const args = [
      ...prefixArgs,
      "run", "--rm", "-i",
      "--name", containerName,
      "--network", "none",
      "--memory", `${memoryMb}m`,
      "--memory-swap", `${memoryMb}m`,
      "--cpus", "1",
      "--pids-limit", "64",
      "--read-only",
      "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--user", "65534:65534",
      `${env.execution.dockerImagePrefix}-${language}-runner`,
    ];

    return spawnSandbox({
      command,
      args,
      payload,
      timeoutMs,
      onTimeout: () => {
        spawn(command, [...prefixArgs, "kill", containerName], { windowsHide: true }).on("error", () => {});
      },
    });
  },
};
