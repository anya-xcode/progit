// Remote code execution over HTTP, for hosts that cannot run a sandbox
// themselves (Vercel and other serverless platforms).
//
//   EXECUTION_PROVIDER=judge0   JUDGE0_URL=https://judge0.example.com
//   EXECUTION_PROVIDER=piston   PISTON_URL=https://emkc.org/api/v2/piston
//
// Both adapters return the same shape as the local sandbox harness, so the
// judge and the rest of the app cannot tell the difference.
import { env } from "../../../config/env.js";
import { ExecutionUnavailableError } from "../spawnSandbox.js";

const SYNTAX_ERROR = /(SyntaxError|IndentationError|TabError):/;

function emptyResult(overrides = {}) {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    signal: null,
    timeMs: 0,
    wallMs: 0,
    memoryKb: null,
    timedOut: false,
    outputLimitExceeded: false,
    memoryLimitExceeded: false,
    ...overrides,
  };
}

async function postJson(url, body, { timeoutMs, headers = {} }) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError") throw new ExecutionUnavailableError(`The code execution service did not respond in time (${url})`);
    throw new ExecutionUnavailableError(`Could not reach the code execution service at ${url}: ${error.message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new ExecutionUnavailableError(`Code execution service returned ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExecutionUnavailableError(`Code execution service returned an invalid response: ${text.slice(0, 200)}`);
  }
}

// A submission whose stderr is only a syntax error never ran, so report it the
// way the local harness does: as a compilation error for the whole run.
function asCompileError(results) {
  const first = results.find((result) => result.stderr);
  if (!first) return null;
  const allFailedToParse = results.every((result) => result.exitCode !== 0 && SYNTAX_ERROR.test(result.stderr));
  return allFailedToParse ? first.stderr.trim() : null;
}

// ---------------------------------------------------------------------------
// Piston (https://github.com/engineer-man/piston) — simple, no memory numbers
// ---------------------------------------------------------------------------
const pistonAdapter = {
  name: "piston",
  get description() {
    return `Piston code execution service (${env.execution.pistonUrl})`;
  },
  async run({ payload, timeoutMs }) {
    const results = [];
    // The public instance rate-limits, so tests run one at a time.
    for (const test of payload.tests) {
      const body = {
        language: "python",
        version: env.execution.pistonPythonVersion,
        files: [{ name: "solution.py", content: payload.code }],
        stdin: test.input,
        run_timeout: payload.timeLimitMs,
        compile_timeout: 10_000,
        run_memory_limit: payload.memoryLimitMb * 1024 * 1024,
      };
      const started = Date.now();
      const data = await postJson(`${env.execution.pistonUrl.replace(/\/$/, "")}/execute`, body, { timeoutMs });
      const run = data.run ?? {};
      const stderr = run.stderr ?? "";
      const timedOut = run.signal === "SIGKILL" || /timed out|timeout/i.test(stderr);

      results.push(
        emptyResult({
          stdout: run.stdout ?? "",
          stderr,
          exitCode: timedOut ? null : (run.code ?? 0),
          signal: run.signal ?? null,
          timeMs: Date.now() - started,
          wallMs: Date.now() - started,
          timedOut,
          memoryLimitExceeded: /MemoryError/.test(stderr),
        })
      );
      if (timedOut && payload.stopAfterTimeout) break;
    }

    return { compileError: asCompileError(results), results, runtime: `Python ${env.execution.pistonPythonVersion} (Piston)` };
  },
};

// ---------------------------------------------------------------------------
// Judge0 (https://judge0.com) — reports CPU time and memory
// ---------------------------------------------------------------------------
const JUDGE0_STATUS = { IN_QUEUE: 1, PROCESSING: 2, ACCEPTED: 3, WRONG_ANSWER: 4, TLE: 5, COMPILATION_ERROR: 6 };

function judge0Headers() {
  const headers = {};
  const token = env.execution.judge0Token;
  if (!token) return headers;
  // Self-hosted Judge0 uses X-Auth-Token; RapidAPI needs its own headers.
  if (env.execution.judge0Url.includes("rapidapi")) {
    headers["X-RapidAPI-Key"] = token;
    headers["X-RapidAPI-Host"] = new URL(env.execution.judge0Url).host;
  } else {
    headers["X-Auth-Token"] = token;
  }
  return headers;
}

const judge0Adapter = {
  name: "judge0",
  get description() {
    return `Judge0 code execution service (${env.execution.judge0Url})`;
  },
  async run({ payload, timeoutMs }) {
    const base = env.execution.judge0Url.replace(/\/$/, "");
    const headers = judge0Headers();
    const submissions = payload.tests.map((test) => ({
      language_id: env.execution.judge0LanguageId,
      source_code: payload.code,
      stdin: test.input,
      cpu_time_limit: Math.max(1, Math.ceil(payload.timeLimitMs / 1000)),
      wall_time_limit: Math.max(2, Math.ceil(payload.timeLimitMs / 1000) + 3),
      memory_limit: payload.memoryLimitMb * 1024,
      redirect_stderr_to_stdout: false,
    }));

    const created = await postJson(`${base}/submissions/batch?base64_encoded=false&wait=true`, { submissions }, { timeoutMs, headers });
    const items = Array.isArray(created) ? created : (created.submissions ?? []);
    const needsPolling = items.some((item) => !item.status || item.status.id <= JUDGE0_STATUS.PROCESSING);
    const finished = needsPolling ? await pollBatch(base, items, headers, timeoutMs) : items;

    const results = finished.map((item) => {
      const status = item.status?.id ?? 0;
      const stderr = [item.stderr, item.compile_output, item.message].filter(Boolean).join("\n").trim();
      return emptyResult({
        stdout: item.stdout ?? "",
        stderr,
        exitCode: status === JUDGE0_STATUS.TLE ? null : Number(item.exit_code ?? (status >= 7 ? 1 : 0)),
        timeMs: Math.round(Number(item.time ?? 0) * 1000),
        wallMs: Math.round(Number(item.wall_time ?? item.time ?? 0) * 1000),
        memoryKb: item.memory ? Math.round(Number(item.memory)) : null,
        timedOut: status === JUDGE0_STATUS.TLE,
        memoryLimitExceeded: /MemoryError|memory limit/i.test(stderr),
      });
    });

    const compileError =
      finished.find((item) => item.status?.id === JUDGE0_STATUS.COMPILATION_ERROR)?.compile_output?.trim() || asCompileError(results);
    return { compileError, results, runtime: "Python (Judge0)" };
  },
};

async function pollBatch(base, items, headers, timeoutMs) {
  const tokens = items.map((item) => item.token).filter(Boolean);
  if (tokens.length === 0) throw new ExecutionUnavailableError("Judge0 did not return submission tokens");

  const deadline = Date.now() + timeoutMs;
  const url = `${base}/submissions/batch?base64_encoded=false&tokens=${tokens.join(",")}`;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) }).catch((error) => {
      throw new ExecutionUnavailableError(`Could not reach Judge0: ${error.message}`);
    });
    const data = await response.json();
    const submissions = data.submissions ?? [];
    if (submissions.every((item) => item.status && item.status.id > JUDGE0_STATUS.PROCESSING)) return submissions;
  }
  throw new ExecutionUnavailableError("Judge0 did not finish the submission in time");
}

export const httpJudgeProviders = { piston: pistonAdapter, judge0: judge0Adapter };
