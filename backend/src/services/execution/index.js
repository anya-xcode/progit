import { env } from "../../config/env.js";
import { isLanguageEnabled } from "../../config/languages.js";
import { badRequest } from "../../utils/httpError.js";
import { dockerProvider } from "./providers/dockerProvider.js";
import { namespaceProvider } from "./providers/namespaceProvider.js";
import { createQueue } from "./queue.js";
import { ExecutionUnavailableError } from "./spawnSandbox.js";

const PROVIDERS = {
  namespace: namespaceProvider,
  docker: dockerProvider,
};

const queue = createQueue(Math.max(1, env.execution.maxConcurrentRuns));

function getProvider() {
  const provider = PROVIDERS[env.execution.provider];
  if (!provider) {
    throw new ExecutionUnavailableError(
      `Unknown EXECUTION_PROVIDER "${env.execution.provider}". Use one of: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }
  return provider;
}

// Runs `code` once per input inside the sandbox and returns the raw harness
// result: { compileError, results: [{ stdout, stderr, exitCode, timeMs, ... }] }
export async function executeCode({ language, code, inputs }) {
  if (!isLanguageEnabled(language)) throw badRequest(`Language "${language}" is not supported yet`);

  const { timeLimitMs, memoryLimitMb, outputLimitKb } = env.execution;
  const payload = {
    code,
    tests: inputs.map((input) => ({ input })),
    timeLimitMs,
    memoryLimitMb,
    outputLimitKb,
    stopAfterTimeout: true,
  };
  // Generous overall budget: startup + every test hitting its wall limit.
  const timeoutMs = 20_000 + inputs.length * (timeLimitMs + 2_000);

  const provider = getProvider();
  return queue.run(() => provider.run({ language, payload, timeoutMs }));
}

export function getExecutionInfo() {
  const provider = PROVIDERS[env.execution.provider];
  return {
    provider: env.execution.provider,
    description: provider?.description ?? "Unknown provider",
    timeLimitMs: env.execution.timeLimitMs,
    memoryLimitMb: env.execution.memoryLimitMb,
    outputLimitKb: env.execution.outputLimitKb,
  };
}

export { ExecutionUnavailableError };
