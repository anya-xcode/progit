import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { normalizeOutput, outputsMatch } from "../../src/services/judge/compare.js";
import { judge } from "../../src/services/judge/judge.js";
import { VERDICTS } from "../../src/services/judge/verdicts.js";

describe("output comparison", () => {
  test("ignores trailing whitespace and blank lines", () => {
    assert.ok(outputsMatch("1 2\n", "1 2"));
    assert.ok(outputsMatch("1 2\n\n\n", "1 2\n"));
    assert.ok(outputsMatch("  1   2  ", "1 2"));
    assert.ok(outputsMatch("1 2\r\n3", "1 2\n3"));
  });

  test("keeps line structure significant", () => {
    assert.ok(!outputsMatch("1 2\n3", "1\n2 3"));
    assert.ok(!outputsMatch("1 2", "1 2 3"));
    assert.ok(!outputsMatch("", "0"));
  });

  test("empty and whitespace-only outputs normalize to nothing", () => {
    assert.equal(normalizeOutput("   \n \n"), "");
    assert.ok(outputsMatch("", "\n\n"));
  });
});

const test1 = { label: "Case 1", input: "1", expectedOutput: "1", isHidden: false };
const hidden = { label: "Hidden 2", input: "2", expectedOutput: "2", isHidden: true };
const ok = (stdout) => ({ stdout, stderr: "", exitCode: 0, signal: null, timeMs: 10, memoryKb: 9000, timedOut: false, outputLimitExceeded: false, memoryLimitExceeded: false });

describe("verdicts", () => {
  test("all tests correct → Accepted", () => {
    const result = judge({ results: [ok("1"), ok("2")] }, [test1, hidden]);
    assert.equal(result.verdict, VERDICTS.ACCEPTED);
    assert.equal(result.passedCount, 2);
    assert.equal(result.totalCount, 2);
  });

  test("one wrong test → Wrong Answer, and the counts say which", () => {
    const result = judge({ results: [ok("1"), ok("9")] }, [test1, hidden]);
    assert.equal(result.verdict, VERDICTS.WRONG_ANSWER);
    assert.equal(result.passedCount, 1);
    assert.equal(result.results[1].passed, false);
  });

  test("compile error short-circuits everything", () => {
    const result = judge({ compileError: "SyntaxError: bad" }, [test1, hidden]);
    assert.equal(result.verdict, VERDICTS.COMPILATION_ERROR);
    assert.equal(result.passedCount, 0);
    assert.match(result.compileError, /SyntaxError/);
  });

  test("limits and crashes map to their own verdicts", () => {
    const cases = [
      [{ ...ok(""), timedOut: true }, VERDICTS.TIME_LIMIT_EXCEEDED],
      [{ ...ok(""), memoryLimitExceeded: true }, VERDICTS.MEMORY_LIMIT_EXCEEDED],
      [{ ...ok(""), outputLimitExceeded: true }, VERDICTS.OUTPUT_LIMIT_EXCEEDED],
      [{ ...ok(""), exitCode: 1, stderr: "Traceback" }, VERDICTS.RUNTIME_ERROR],
    ];
    for (const [result, expected] of cases) {
      assert.equal(judge({ results: [result] }, [test1]).verdict, expected);
    }
  });

  test("time limit takes priority over a wrong answer on the same test", () => {
    const result = judge({ results: [{ ...ok("nonsense"), timedOut: true }] }, [test1]);
    assert.equal(result.verdict, VERDICTS.TIME_LIMIT_EXCEEDED);
  });

  test("tests after a time limit are reported as skipped, not failed silently", () => {
    const result = judge({ results: [{ ...ok(""), timedOut: true }] }, [test1, hidden]);
    assert.equal(result.results[1].verdict, VERDICTS.SKIPPED);
    assert.equal(result.results[1].timeMs, null);
  });

  test("custom input (no expected output) runs but is not judged", () => {
    const custom = { label: "Custom input", input: "x", expectedOutput: null, isHidden: false };
    const result = judge({ results: [ok("1"), ok("anything")] }, [test1, custom]);
    assert.equal(result.verdict, VERDICTS.ACCEPTED);
    assert.equal(result.totalCount, 1, "custom input must not count as a test case");
    assert.equal(result.results[1].verdict, VERDICTS.FINISHED);
  });

  test("runtime and memory are the worst case across tests", () => {
    const slow = { ...ok("1"), timeMs: 120, memoryKb: 20000 };
    const result = judge({ results: [ok("1"), slow] }, [test1, { ...hidden, expectedOutput: "1" }]);
    assert.equal(result.runtime, 120);
    assert.equal(result.memory, 20000);
  });
});
