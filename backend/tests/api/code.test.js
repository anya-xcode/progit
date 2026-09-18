// /api/code — these talk to the real sandbox, so they are the slow tests.
// Budget: nine sandbox runs in the whole file.
import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import Problem from "../../src/models/Problem.js";
import { PYTHON, startTestServer } from "../helpers/testServer.js";

const TIMEOUT = 180_000;

// Passes both visible Two Sum cases by hard-coding them, then fails the
// hidden ones — used to check what a hidden failure is allowed to reveal.
const PASSES_SAMPLES_ONLY = `import sys

data = sys.stdin.read().split()
n, target = int(data[0]), int(data[1])
if target == 9:
    print(0, 1)
elif target == 6 and n == 3:
    print(1, 2)
else:
    print(0, 0)
`;

let server;
let twoSum;
let info;
// A sheet entry whose content is not written yet. The seeded library has none,
// so one is turned into a placeholder inside the throwaway database.
const PLACEHOLDER_SLUG = "count-palindromic-subsequences";
let placeholderId;

before(async () => {
  server = await startTestServer();
  twoSum = (await server.get("/problems/two-sum")).data;
  info = (await server.get("/code/info")).data;

  const victim = await Problem.findOne({ slug: PLACEHOLDER_SLUG }).lean();
  placeholderId = String(victim._id);
  await Problem.updateOne({ _id: victim._id }, { $set: { contentStatus: "placeholder", testCases: [] } });
}, { timeout: TIMEOUT });

after(async () => {
  await server.close();
});

describe("POST /api/code/run", () => {
  test("runs the sample tests only", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/run", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      language: "python",
    });

    assert.equal(status, 200);
    assert.equal(data.mode, "run");
    assert.equal(data.verdict, "Accepted");
    assert.equal(data.passedCount, 2);
    assert.equal(data.totalCount, 2, "run must not touch the hidden tests");
    assert.equal(data.results.length, 2);
    assert.deepEqual(data.results.map((r) => r.label), ["Case 1", "Case 2"]);
    assert.ok(data.results.every((r) => r.isHidden === false));
    assert.ok(data.results.every((r) => r.passed === true));
    assert.equal(data.results[0].actualOutput.trim(), "0 1");
    assert.equal(data.results[0].expectedOutput.trim(), "0 1");
    assert.ok(Number.isInteger(data.results[0].timeMs));
    assert.ok(data.results[0].memoryKb > 0);
    assert.ok(/^Python 3/.test(data.runtimeVersion), `unexpected runtime ${data.runtimeVersion}`);

    // Nothing is saved by a run.
    assert.deepEqual((await server.get(`/submissions?problemId=${twoSum._id}`)).data, []);
    assert.equal((await server.get("/problems/two-sum")).data.status, "unsolved");
  });

  test("custom input runs alongside the samples but is not judged", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/run", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      language: "python",
      customInput: "3 6\n3 2 4\n",
    });

    assert.equal(status, 200);
    assert.equal(data.results.length, 3);
    assert.equal(data.passedCount, 2);
    assert.equal(data.totalCount, 2, "custom input must not count as a test case");

    const custom = data.results[2];
    assert.equal(custom.label, "Custom input");
    assert.equal(custom.verdict, "Finished");
    assert.equal(custom.expectedOutput, null);
    assert.equal(custom.actualOutput.trim(), "1 2");
    assert.equal(custom.passed, false, "a case with no expected output cannot pass");
    assert.equal(data.verdict, "Accepted", "the custom case must not change the overall verdict");
  });

  test("rejects a run with nothing to do", async () => {
    const { status, data } = await server.post("/code/run", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      runSamples: false,
    });
    assert.equal(status, 400);
    assert.equal(data.message, "Nothing to run: add custom input or enable sample tests");
  });

  test("rejects oversized custom input", async () => {
    const { status, data } = await server.post("/code/run", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      customInput: "1 ".repeat(60_000),
    });
    assert.equal(status, 400);
    assert.equal(data.message, "Custom input is too long");
  });
});

describe("POST /api/code/submit — an accepted solution", () => {
  let solutionId;
  let response;

  before(async () => {
    const approach = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Hash Map",
      code: "print(0, 0)\n",
      approach: "Optimal",
    });
    assert.equal(approach.status, 201);
    assert.equal(approach.data.verdict, "Not Submitted");
    solutionId = approach.data._id;

    response = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      language: "python",
      solutionId,
    });
  }, { timeout: TIMEOUT });

  test("every test runs and the verdict is Accepted", () => {
    assert.equal(response.status, 201);
    assert.equal(response.data.mode, "submit");
    assert.equal(response.data.verdict, "Accepted");
    assert.equal(response.data.compileError, "");
    assert.equal(response.data.passedCount, 6);
    assert.equal(response.data.totalCount, 6, "submit runs the hidden tests too");
    assert.equal(response.data.results.length, 6);
    assert.ok(response.data.results.every((r) => r.passed === true));
    assert.equal(response.data.results.filter((r) => r.isHidden).length, 4);
    assert.ok(response.data.runtime >= 0);
    assert.ok(response.data.memory > 0);
  });

  test("the submission is stored with its test results", async () => {
    const { status, data } = await server.get(`/submissions/${response.data.submissionId}`);

    assert.equal(status, 200);
    assert.equal(data.verdict, "Accepted");
    assert.equal(data.language, "python");
    assert.equal(data.code, PYTHON.twoSumAccepted);
    assert.equal(data.problemId, twoSum._id);
    assert.equal(data.solutionId._id, solutionId);
    assert.equal(data.passedCount, 6);
    assert.equal(data.totalCount, 6);
    assert.equal(data.testResults.length, 6);
    assert.equal(data.compileError, "");

    const history = await server.get(`/submissions?problemId=${twoSum._id}`);
    assert.equal(history.data.length, 1);
    assert.equal(history.data[0].verdict, "Accepted");
    assert.equal(history.data[0].code, undefined, "the history list must stay light");
  });

  test("the linked approach takes over the code, verdict, runtime and memory", async () => {
    assert.equal(response.data.solution.verdict, "Accepted");
    assert.equal(response.data.solution.code, PYTHON.twoSumAccepted);
    assert.equal(response.data.solution.isDraft, false);

    const stored = (await server.get(`/solutions/${twoSum._id}`)).data.find((s) => s._id === solutionId);
    assert.equal(stored.verdict, "Accepted");
    assert.equal(stored.code, PYTHON.twoSumAccepted);
    assert.equal(stored.runtime, response.data.runtime);
    assert.equal(stored.memory, response.data.memory);
    assert.equal(stored.isDraft, false);
    assert.notEqual(stored.lastSubmittedAt, null);
  });

  test("the problem is now solved in the library", async () => {
    const list = await server.get("/problems?section=Arrays");
    const row = list.data.problems.find((p) => p.slug === "two-sum");
    assert.equal(row.status, "solved");
    assert.equal(row.solutionCount, 1);

    assert.equal((await server.get("/problems/two-sum")).data.status, "solved");
    assert.equal((await server.get("/problems?status=solved")).data.total, 1);
  });
});

describe("POST /api/code/submit — failing verdicts", () => {
  test("a wrong answer reports which case failed", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.wrongAnswer,
      language: "python",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Wrong Answer");
    assert.equal(data.passedCount, 0);
    assert.equal(data.totalCount, 6);

    const failure = data.results[0];
    assert.equal(failure.verdict, "Wrong Answer");
    assert.equal(failure.passed, false);
    assert.equal(failure.label, "Case 1");
    assert.equal(failure.input, "4 9\n2 7 11 15\n");
    assert.equal(failure.expectedOutput, "0 1\n");
    assert.equal(failure.actualOutput, "0 0\n");

    // The first failure is a visible case, so no hidden case may be revealed.
    for (const hidden of data.results.filter((r) => r.isHidden)) {
      assert.equal(hidden.input, undefined, "a hidden input leaked");
      assert.equal(hidden.expectedOutput, undefined, "a hidden expected output leaked");
      assert.equal(hidden.actualOutput, undefined);
    }

    assert.equal((await server.get("/problems/two-sum")).data.status, "solved", "an earlier accepted run still counts");
  });

  test("a hidden failure reveals only the first failing case", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PASSES_SAMPLES_ONLY,
      language: "python",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Wrong Answer");
    assert.equal(data.passedCount, 2);
    assert.equal(data.totalCount, 6);
    assert.ok(data.results.slice(0, 2).every((r) => r.passed === true));

    const firstHiddenFailure = data.results[2];
    assert.equal(firstHiddenFailure.isHidden, true);
    assert.equal(firstHiddenFailure.label, "Hidden case 3");
    assert.equal(firstHiddenFailure.passed, false);
    assert.equal(firstHiddenFailure.input, "2 6\n3 3\n");
    assert.equal(firstHiddenFailure.expectedOutput, "0 1\n");
    assert.equal(firstHiddenFailure.actualOutput, "0 0\n");

    for (const later of data.results.slice(3)) {
      assert.equal(later.isHidden, true);
      assert.equal(later.passed, false);
      assert.equal(later.input, undefined, `${later.label} leaked its input`);
      assert.equal(later.expectedOutput, undefined, `${later.label} leaked its expected output`);
      assert.equal(later.actualOutput, undefined, `${later.label} leaked its output`);
    }

    // The stored submission is redacted the same way.
    const stored = await server.get(`/submissions/${data.submissionId}`);
    assert.equal(stored.data.testResults[2].input, "2 6\n3 3\n");
    assert.equal(stored.data.testResults[3].input, undefined);
  });

  test("a syntax error is a Compilation Error before anything runs", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.compilationError,
      language: "python",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Compilation Error");
    assert.match(data.compileError, /SyntaxError/);
    assert.equal(data.passedCount, 0);
    assert.equal(data.totalCount, 6);
    assert.deepEqual(data.results, []);
    assert.equal(data.runtime, null);
    assert.equal(data.memory, null);

    const stored = await server.get(`/submissions/${data.submissionId}`);
    assert.equal(stored.data.verdict, "Compilation Error");
    assert.match(stored.data.compileError, /SyntaxError/);
  });

  test("a crash is a Runtime Error and the traceback is reported", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.runtimeError,
      language: "python",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Runtime Error");
    assert.equal(data.passedCount, 0);
    assert.equal(data.totalCount, 6);
    assert.equal(data.results[0].verdict, "Runtime Error");
    assert.equal(data.results[0].passed, false);
    assert.match(data.results[0].error, /ZeroDivisionError/);
  });

  test("an infinite loop is a Time Limit Exceeded and stops the run", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.timeLimit,
      language: "python",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Time Limit Exceeded");
    assert.equal(data.passedCount, 0);
    assert.equal(data.totalCount, 6);
    assert.equal(data.results[0].verdict, "Time Limit Exceeded");
    assert.equal(data.results[0].error, `Exceeded the ${info.timeLimitMs} ms time limit`);
    assert.equal(data.results[1].verdict, "Skipped");
    assert.equal(data.results[1].timeMs, null);
  });

  test("the failing submits are all on file", async () => {
    const history = await server.get(`/submissions?problemId=${twoSum._id}`);
    assert.deepEqual(
      history.data.map((s) => s.verdict),
      ["Time Limit Exceeded", "Runtime Error", "Compilation Error", "Wrong Answer", "Wrong Answer", "Accepted"],
      "newest first"
    );
  });
});

describe("requests the sandbox never sees", () => {
  test("a placeholder problem cannot be run", async () => {
    const { status, data } = await server.post("/code/run", {
      problemId: placeholderId,
      code: PYTHON.twoSumAccepted,
      language: "python",
    });
    assert.equal(status, 400);
    assert.equal(
      data.message,
      "This problem has no statement or test cases in DSAForge yet, so it cannot be run or submitted."
    );
  });

  test("a placeholder problem cannot be submitted", async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: placeholderId,
      code: PYTHON.twoSumAccepted,
      language: "python",
    });
    assert.equal(status, 400);
    assert.equal(
      data.message,
      "This problem has no statement or test cases in DSAForge yet, so it cannot be run or submitted."
    );
    assert.deepEqual((await server.get(`/submissions?problemId=${placeholderId}`)).data, []);
  });

  test("a reference entry has nothing to run", async () => {
    const reference = (await server.get("/problems/stl")).data;
    assert.equal(reference.contentStatus, "reference");

    const { status, data } = await server.post("/code/run", {
      problemId: reference._id,
      code: "print(1)\n",
      language: "python",
    });
    assert.equal(status, 400);
    assert.match(data.message, /reference entry/i, "the message should say why there is nothing to run");
    assert.match(data.message, /marked as done/i, "and point at what to do instead");
  });

  // FAILING ON PURPOSE — this is a bug in codeController.readRequest, which
  // guards "placeholder" but not "reference". A reference entry has no test
  // cases, so judge() returns the "Finished" verdict and Submission.verdict's
  // enum rejects it: the client gets a raw Mongoose message after a pointless
  // sandbox run, instead of being told the entry is ticked off, not solved.
  test("a reference entry cannot be submitted, and says so in plain words", { timeout: TIMEOUT }, async () => {
    const reference = (await server.get("/problems/stl")).data;

    const { status, data } = await server.post("/code/submit", {
      problemId: reference._id,
      code: "print(1)\n",
      language: "python",
    });

    assert.equal(status, 400);
    assert.doesNotMatch(
      data.message,
      /enum value for path/,
      "the client must never see a raw Mongoose validation message"
    );
    assert.match(data.message, /submitted|marked as done/i, `unhelpful message: ${data.message}`);
    assert.deepEqual((await server.get(`/submissions?problemId=${reference._id}`)).data, []);
  });

  test("an unsupported language is rejected", async () => {
    for (const path of ["/code/run", "/code/submit"]) {
      const { status, data } = await server.post(path, {
        problemId: twoSum._id,
        code: "console.log(1)",
        language: "javascript",
      });
      assert.equal(status, 400, `${path} should reject javascript`);
      assert.equal(data.message, 'Language "javascript" is not supported yet');
    }
  });

  test("empty code is rejected", async () => {
    for (const path of ["/code/run", "/code/submit"]) {
      const empty = await server.post(path, { problemId: twoSum._id, code: "   \n\t " });
      assert.equal(empty.status, 400, `${path} should reject blank code`);
      assert.equal(empty.data.message, "Code is required");

      const missing = await server.post(path, { problemId: twoSum._id });
      assert.equal(missing.status, 400);
      assert.equal(missing.data.message, "Code is required");
    }
  });

  test("code over 64 KB is rejected", async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: `#${"x".repeat(64_000)}`,
    });
    assert.equal(status, 400);
    assert.equal(data.message, "Code is too long (64 KB max)");
  });

  test("bad problem ids are 400, unknown ones are 404", async () => {
    const malformed = await server.post("/code/run", { problemId: "nope", code: "print(1)" });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.data.message, "A valid problemId is required");

    const unknown = await server.post("/code/submit", { problemId: "000000000000000000000000", code: "print(1)" });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.message, "Problem not found");
  });

  test("submitting against an approach that is not this problem's is a 404", async () => {
    const threeSum = (await server.get("/problems/3-sum")).data;
    const foreign = await server.post("/solutions", {
      problemId: threeSum._id,
      title: "Elsewhere",
      code: "print(1)\n",
    });

    const { status, data } = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      solutionId: foreign.data._id,
    });
    assert.equal(status, 404);
    assert.equal(data.message, "Solution not found for this problem");

    const malformed = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      solutionId: "not-an-id",
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.data.message, "Invalid solutionId");
  });
});

describe("sandbox information", () => {
  test("GET /api/code/info reports the provider and the limits", async () => {
    const { status, data } = await server.get("/code/info");

    assert.equal(status, 200);
    assert.ok(["namespace", "docker"].includes(data.provider), `unknown provider ${data.provider}`);
    assert.equal(typeof data.description, "string");
    assert.ok(data.description.length > 0);
    assert.ok(Number.isInteger(data.timeLimitMs) && data.timeLimitMs > 0);
    assert.ok(Number.isInteger(data.memoryLimitMb) && data.memoryLimitMb > 0);
    assert.ok(Number.isInteger(data.outputLimitKb) && data.outputLimitKb > 0);
    assert.notEqual(data.description, "Unknown provider");
  });

  test("POST /api/code/health runs a tiny program", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/health", {});

    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.ok(/^Python 3/.test(data.runtime), `unexpected runtime ${data.runtime}`);
    assert.ok(data.durationMs >= 0);
    assert.equal(data.provider, info.provider);
    assert.equal(data.timeLimitMs, info.timeLimitMs);
  });
});
