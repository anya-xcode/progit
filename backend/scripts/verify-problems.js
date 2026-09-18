// Checks the problem library data before it is seeded.
//
//   npm run verify:problems                    # every problem
//   npm run verify:problems -- --section arrays
//   npm run verify:problems -- --slug two-sum
//   npm run verify:problems -- --sandbox       # judge through the real sandbox
//
// For each problem it validates the YAML fields, then runs the reference
// solution (trusted code written by the library author) with the local
// Python interpreter against every example and test case.
// Set PYTHON_BIN if Python is not on PATH as "python".
//
// With --sandbox, reference solutions are instead submitted through the same
// sandbox + judge used by the app (its Python version and time limits).
import { spawn } from "node:child_process";
import { loadProblems } from "../src/data/loadProblems.js";
import { findSectionByKey } from "../src/data/sections.js";
import { executeCode } from "../src/services/execution/index.js";
import { normalizeOutput, outputsMatch } from "../src/services/judge/compare.js";
import { judge } from "../src/services/judge/judge.js";

const USE_SANDBOX = process.argv.includes("--sandbox");

const PYTHON = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function runPython(code, input) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ["-I", "-c", code], { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ stdout, stderr: String(error), exitCode: -1 }));
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: signal ? `killed (${signal}) after ${TIMEOUT_MS}ms` : stderr, exitCode });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function checkInSandbox(problem) {
  const tests = [
    ...problem.examples.map((e, i) => ({ label: `example ${i + 1}`, input: e.input, expectedOutput: e.output, isHidden: false })),
    ...problem.testCases.map((t, i) => ({ label: `test ${i + 1}`, input: t.input, expectedOutput: t.expectedOutput, isHidden: t.isHidden })),
  ];
  const raw = await executeCode({ language: "python", code: problem.referenceSolution.python, inputs: tests.map((t) => t.input) });
  const outcome = judge(raw, tests);
  if (outcome.compileError) return [`compilation error in sandbox:\n${outcome.compileError}`];
  return outcome.results
    .filter((r) => !r.passed)
    .map((r) => `${r.label}: ${r.verdict}${r.error ? `\n${r.error}` : ""}`);
}

async function checkProblem(problem) {
  if (USE_SANDBOX) return checkInSandbox(problem);
  const failures = [];
  const code = problem.referenceSolution.python;

  const compileCheck = await runPython(
    `import sys\ncompile(sys.stdin.read(), "starter.py", "exec")`,
    problem.starterCode.python
  );
  if (compileCheck.exitCode !== 0) failures.push(`starter code does not compile:\n${compileCheck.stderr}`);

  const cases = [
    ...problem.examples.map((example, i) => ({ label: `example ${i + 1}`, input: example.input, expected: example.output })),
    ...problem.testCases.map((test, i) => ({
      label: `test ${i + 1}${test.isHidden ? " (hidden)" : ""}`,
      input: test.input,
      expected: test.expectedOutput,
    })),
  ];

  for (const testCase of cases) {
    const result = await runPython(code, testCase.input);
    if (result.exitCode !== 0) {
      failures.push(`${testCase.label}: reference solution crashed\n${result.stderr.trim()}`);
    } else if (!outputsMatch(result.stdout, testCase.expected)) {
      failures.push(
        `${testCase.label}: output mismatch\n    input:    ${JSON.stringify(testCase.input)}\n    expected: ${JSON.stringify(
          normalizeOutput(testCase.expected)
        )}\n    actual:   ${JSON.stringify(normalizeOutput(result.stdout))}`
      );
    }
  }

  return failures;
}

async function main() {
  let problems;
  try {
    problems = loadProblems({ includeReference: true });
  } catch (error) {
    console.error(`✗ Invalid problem data\n${error.message}`);
    process.exit(1);
  }

  const sectionKey = argValue("--section");
  const slug = argValue("--slug");
  if (sectionKey) {
    const section = findSectionByKey(sectionKey);
    if (!section) {
      console.error(`Unknown section "${sectionKey}"`);
      process.exit(1);
    }
    problems = problems.filter((p) => p.section === section.name);
  }
  if (slug) problems = problems.filter((p) => p.slug === slug);
  // Reference entries have no code to check.
  const referenceCount = problems.filter((p) => p.contentStatus === "reference").length;
  problems = problems.filter((p) => p.contentStatus !== "reference");
  if (referenceCount > 0) console.log(`(skipping ${referenceCount} reference entr${referenceCount === 1 ? "y" : "ies"})`);

  console.log(`Checking ${problems.length} problem(s) with ${USE_SANDBOX ? "the code execution sandbox" : PYTHON}...\n`);

  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < problems.length) {
      const problem = problems[next++];
      const failures = await checkProblem(problem);
      if (failures.length === 0) {
        console.log(`✓ ${problem.section} / ${problem.slug} (${problem.testCases.length} tests)`);
      } else {
        failed++;
        console.log(`✗ ${problem.section} / ${problem.slug}\n  - ${failures.join("\n  - ")}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n${problems.length - failed}/${problems.length} problems passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
