import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import Submission from "../models/Submission.js";
import { executeCode, getExecutionInfo } from "../services/execution/index.js";
import { autoSyncIfEnabled } from "../services/github/syncService.js";
import { judge } from "../services/judge/judge.js";
import { VERDICTS } from "../services/judge/verdicts.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { truncate } from "../utils/text.js";

const MAX_CODE_LENGTH = 64_000;
const MAX_CUSTOM_INPUT = 100_000;
const STORED_TEXT_LIMIT = 2_000;

async function readRequest(body = {}) {
  const { problemId, code, language = "python" } = body;
  if (!mongoose.isValidObjectId(problemId)) throw badRequest("A valid problemId is required");
  if (typeof code !== "string" || !code.trim()) throw badRequest("Code is required");
  if (code.length > MAX_CODE_LENGTH) throw badRequest("Code is too long (64 KB max)");

  const problem = await Problem.findById(problemId).lean();
  if (!problem) throw notFound("Problem not found");
  if (problem.contentStatus === "placeholder") {
    throw badRequest("This problem has no statement or test cases in DSAForge yet, so it cannot be run or submitted.");
  }
  return { problem, code, language };
}

// POST /api/code/run — visible test cases and/or custom input; nothing is saved
export async function runCode(req, res) {
  const { problem, code, language } = await readRequest(req.body);
  const { customInput, runSamples = true } = req.body;

  const tests = [];
  if (runSamples) {
    problem.testCases
      .filter((test) => !test.isHidden)
      .forEach((test, i) => tests.push({ label: `Case ${i + 1}`, input: test.input, expectedOutput: test.expectedOutput, isHidden: false }));
  }
  if (typeof customInput === "string") {
    if (customInput.length > MAX_CUSTOM_INPUT) throw badRequest("Custom input is too long");
    tests.push({ label: "Custom input", input: customInput, expectedOutput: null, isHidden: false });
  }
  if (tests.length === 0) throw badRequest("Nothing to run: add custom input or enable sample tests");

  const harnessResult = await executeCode({ language, code, inputs: tests.map((t) => t.input) });
  res.json({ mode: "run", ...judge(harnessResult, tests) });
}

// POST /api/code/submit — full test suite; stores a Submission and, when a
// solutionId is given, saves the code and verdict on that approach.
export async function submitCode(req, res) {
  const { problem, code, language } = await readRequest(req.body);
  const { solutionId } = req.body;

  let solution = null;
  if (solutionId) {
    if (!mongoose.isValidObjectId(solutionId)) throw badRequest("Invalid solutionId");
    solution = await Solution.findOne({ _id: solutionId, problemId: problem._id });
    if (!solution) throw notFound("Solution not found for this problem");
  }

  let visibleCount = 0;
  const tests = problem.testCases.map((test, i) => ({
    label: test.isHidden ? `Hidden case ${i + 1}` : `Case ${++visibleCount}`,
    input: test.input,
    expectedOutput: test.expectedOutput,
    isHidden: test.isHidden,
  }));

  const harnessResult = await executeCode({ language, code, inputs: tests.map((t) => t.input) });
  const outcome = judge(harnessResult, tests);
  const firstFailureIndex = outcome.results.findIndex((r) => !r.passed && r.verdict !== VERDICTS.SKIPPED);

  // Hidden test details are only revealed for the first failing case.
  const testResults = outcome.results.map((result, i) => {
    const showDetails = !result.isHidden || i === firstFailureIndex;
    return {
      index: result.index,
      verdict: result.verdict,
      passed: result.passed,
      isHidden: result.isHidden,
      timeMs: result.timeMs,
      memoryKb: result.memoryKb,
      ...(showDetails && {
        input: truncate(result.input, STORED_TEXT_LIMIT),
        expectedOutput: truncate(result.expectedOutput, STORED_TEXT_LIMIT),
        actualOutput: truncate(result.actualOutput, STORED_TEXT_LIMIT),
        error: truncate(result.error, STORED_TEXT_LIMIT),
      }),
    };
  });

  const submission = await Submission.create({
    problemId: problem._id,
    solutionId: solution?._id ?? null,
    code,
    language,
    verdict: outcome.verdict,
    runtime: outcome.runtime,
    memory: outcome.memory,
    passedCount: outcome.passedCount,
    totalCount: outcome.totalCount,
    compileError: outcome.compileError,
    testResults,
  });

  if (solution) {
    Object.assign(solution, {
      code,
      language,
      verdict: outcome.verdict,
      runtime: outcome.runtime,
      memory: outcome.memory,
      isDraft: outcome.verdict !== VERDICTS.ACCEPTED,
      lastSubmittedAt: submission.submittedAt,
    });
    await solution.save();
    // Accepted → commit to GitHub in the background (when auto-sync is on).
    if (await autoSyncIfEnabled(solution)) solution = await Solution.findById(solution._id);
  }

  res.status(201).json({
    mode: "submit",
    submissionId: submission._id,
    solution,
    verdict: outcome.verdict,
    compileError: outcome.compileError,
    passedCount: outcome.passedCount,
    totalCount: outcome.totalCount,
    runtime: outcome.runtime,
    memory: outcome.memory,
    runtimeVersion: outcome.runtimeVersion,
    results: testResults.map((result, i) => ({ ...result, label: tests[i].label })),
  });
}

// GET /api/code/info — sandbox settings shown in the UI
export function getCodeInfo(req, res) {
  res.json(getExecutionInfo());
}

// POST /api/code/health — runs a tiny program to prove the sandbox works
export async function checkSandbox(req, res) {
  const started = Date.now();
  const result = await executeCode({ language: "python", code: "print(sum(range(10)))", inputs: [""] });
  const ok = !result.compileError && result.results?.[0]?.stdout?.trim() === "45";
  res.json({ ok, runtime: result.runtime, durationMs: Date.now() - started, ...getExecutionInfo() });
}
