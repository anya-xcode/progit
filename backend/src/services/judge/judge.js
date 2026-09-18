import { env } from "../../config/env.js";
import { truncate } from "../../utils/text.js";
import { outputsMatch } from "./compare.js";
import { VERDICTS } from "./verdicts.js";

const MAX_TEXT = 4000;

function errorMessage(result) {
  const stderr = (result.stderr || "").trim();
  if (stderr) return truncate(stderr, MAX_TEXT);
  if (result.signal) return `Process terminated by signal ${result.signal}`;
  if (result.exitCode) return `Process exited with code ${result.exitCode}`;
  return "";
}

function verdictFor(result, expectedOutput) {
  if (result.timedOut) return VERDICTS.TIME_LIMIT_EXCEEDED;
  if (result.memoryLimitExceeded) return VERDICTS.MEMORY_LIMIT_EXCEEDED;
  if (result.outputLimitExceeded) return VERDICTS.OUTPUT_LIMIT_EXCEEDED;
  if (result.exitCode !== 0) return VERDICTS.RUNTIME_ERROR;
  if (expectedOutput === null) return VERDICTS.FINISHED;
  return outputsMatch(result.stdout, expectedOutput) ? VERDICTS.ACCEPTED : VERDICTS.WRONG_ANSWER;
}

// Combines harness results with expected outputs.
// `tests`: [{ input, expectedOutput (string or null), isHidden, label }]
export function judge(harnessResult, tests) {
  if (harnessResult.compileError) {
    return {
      verdict: VERDICTS.COMPILATION_ERROR,
      compileError: harnessResult.compileError,
      passedCount: 0,
      totalCount: tests.filter((t) => t.expectedOutput !== null).length,
      runtime: null,
      memory: null,
      results: [],
    };
  }

  const raw = harnessResult.results ?? [];
  const results = tests.map((test, index) => {
    const result = raw[index];
    const base = { index, label: test.label, isHidden: test.isHidden, input: test.input, expectedOutput: test.expectedOutput };

    if (!result) {
      return { ...base, verdict: VERDICTS.SKIPPED, passed: false, actualOutput: "", error: "Skipped after an earlier time limit", timeMs: null, memoryKb: null };
    }

    const verdict = verdictFor(result, test.expectedOutput);
    return {
      ...base,
      verdict,
      passed: verdict === VERDICTS.ACCEPTED,
      actualOutput: truncate(result.stdout, MAX_TEXT),
      error:
        verdict === VERDICTS.TIME_LIMIT_EXCEEDED
          ? `Exceeded the ${env.execution.timeLimitMs} ms time limit`
          : verdict === VERDICTS.MEMORY_LIMIT_EXCEEDED
            ? `Exceeded the ${env.execution.memoryLimitMb} MB memory limit`
            : errorMessage(result),
      timeMs: Math.round(result.timeMs),
      memoryKb: result.memoryKb,
    };
  });

  const judged = results.filter((r) => r.expectedOutput !== null);
  const firstFailure = results.find(
    (r) => r.verdict !== VERDICTS.ACCEPTED && r.verdict !== VERDICTS.FINISHED && r.verdict !== VERDICTS.SKIPPED
  );
  const executed = results.filter((r) => r.timeMs !== null);

  return {
    verdict: firstFailure ? firstFailure.verdict : judged.length > 0 ? VERDICTS.ACCEPTED : VERDICTS.FINISHED,
    compileError: "",
    passedCount: judged.filter((r) => r.passed).length,
    totalCount: judged.length,
    runtime: executed.length ? Math.max(...executed.map((r) => r.timeMs)) : null,
    memory: executed.length ? Math.max(...executed.map((r) => r.memoryKb)) : null,
    runtimeVersion: harnessResult.runtime,
    results,
  };
}
