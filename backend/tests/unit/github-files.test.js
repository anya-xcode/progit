import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { gitBlobSha } from "../../src/services/github/gitCommit.js";
import {
  joinPath,
  problemFolder,
  renderProblemMd,
  renderProblemReadme,
  renderRootReadme,
  renderSolutionFile,
  renderTestCases,
  sectionFolder,
  solutionFileName,
  solutionPath,
} from "../../src/services/github/repoFiles.js";

const problem = {
  title: "Two Sum",
  section: "Arrays",
  sectionOrder: 3,
  subtopic: "Medium Problems",
  topic: "Hashing",
  difficulty: "Easy",
  tags: ["array", "hashing"],
  sourceUrl: "https://leetcode.com/problems/two-sum/",
  statement: "First paragraph of the statement.\n\nSecond paragraph.",
  inputFormat: "- Line 1: n and target",
  outputFormat: "Print two indices",
  constraints: ["2 <= n <= 10^4"],
  examples: [{ input: "4 9\n2 7 11 15", output: "0 1", explanation: "2 + 7 = 9" }],
  testCases: [
    { input: "4 9\n2 7 11 15", expectedOutput: "0 1", isHidden: false },
    { input: "2 6\n3 3", expectedOutput: "0 1", isHidden: true },
  ],
};

const solution = {
  title: "Hash Map",
  slug: "hash-map",
  approach: "Optimal",
  language: "python",
  code: "def two_sum(nums, target):\n    return []\n",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
  explanation: "Store each value's index.",
  verdict: "Accepted",
  runtime: 26,
  memory: 9400,
};

describe("repository paths", () => {
  test("step folder is numbered and title-cased", () => {
    assert.equal(sectionFolder(problem), "03-Arrays");
    assert.equal(sectionFolder({ ...problem, sectionOrder: 10, section: "Sliding Window and Two Pointer" }), "10-Sliding-Window-and-Two-Pointer");
  });

  test("problem folder and file name follow the sheet", () => {
    assert.equal(problemFolder(problem), "03-Arrays/Two-Sum");
    assert.equal(solutionFileName(solution), "hash-map.py");
    assert.equal(solutionPath(problem, solution), "03-Arrays/Two-Sum/hash-map.py");
  });

  test("a base folder is prefixed and slashes never double up", () => {
    assert.equal(solutionPath(problem, solution, "dsa-solutions"), "dsa-solutions/03-Arrays/Two-Sum/hash-map.py");
    assert.equal(joinPath("/a/", "/b/", "c"), "a/b/c");
  });

  test("titles with punctuation stay file-safe", () => {
    assert.equal(problemFolder({ ...problem, title: "Pow(x, n) / Fast Power!" }), "03-Arrays/Pow-x-n-Fast-Power");
  });
});

describe("generated files", () => {
  test("solution file carries approach, complexities and the code", () => {
    const file = renderSolutionFile(problem, solution);
    assert.match(file, /^# Problem: Two Sum\n# Approach: Hash Map \(Optimal\)\n# Time Complexity: O\(n\)\n# Space Complexity: O\(n\)/);
    assert.match(file, /# Explanation:\n# Store each value's index\./);
    assert.ok(file.trimEnd().endsWith("return []"), "code must be last");
  });

  test("problem.md contains the statement, formats, constraints, examples and tests", () => {
    const file = renderProblemMd(problem);
    for (const heading of ["# Two Sum", "## Problem Statement", "## Input Format", "## Output Format", "## Constraints", "## Examples", "## Test Cases"]) {
      assert.ok(file.includes(heading), `missing ${heading}`);
    }
    assert.match(file, /\| \*\*Difficulty\*\* \| Easy \|/);
    assert.ok(file.includes("test_cases.txt"));
    assert.ok(!file.includes("2 6\n3 3"), "hidden test input must not leak into problem.md");
  });

  test("test_cases.txt includes every case and marks hidden ones", () => {
    const file = renderTestCases(problem);
    assert.match(file, /=== Test Case 1 ===/);
    assert.match(file, /=== Test Case 2 \(hidden\) ===/);
    assert.ok(file.includes("3 3"));
  });

  test("problem README compares approaches", () => {
    const second = { ...solution, title: "Brute Force", slug: "brute-force", timeComplexity: "O(n^2)" };
    const file = renderProblemReadme(problem, [second, solution]);
    assert.match(file, /\| # \| Approach \| Type \| Time \| Space \| Status \| Solution \|/);
    assert.ok(file.includes("[brute-force.py](brute-force.py)"));
    assert.ok(file.includes("[hash-map.py](hash-map.py)"));
    assert.match(file, /✅ Accepted \(26 ms, 9\.2 MB\)/);
  });

  test("root README groups problems by step with working links", () => {
    const file = renderRootReadme([{ problem, solutions: [solution] }]);
    assert.match(file, /\*\*1 problem · 1 solution · 1 solved\*\*/);
    assert.ok(file.includes("## Arrays"));
    assert.ok(file.includes("(03-Arrays/Two-Sum/README.md)"));
    assert.ok(file.includes("(03-Arrays/Two-Sum/hash-map.py)"));
  });

  test("pipes in titles cannot break the markdown tables", () => {
    const file = renderRootReadme([{ problem: { ...problem, title: "A | B" }, solutions: [solution] }]);
    const row = file.split("\n").find((line) => line.includes("A \\| B"));
    assert.ok(row, "pipe should be escaped");
    // Only unescaped pipes separate cells, so the row keeps its 4 columns.
    const separators = row.match(/(?<!\\)\|/g) ?? [];
    assert.equal(separators.length, 5, `row has ${separators.length} separators: ${row}`);
  });

  test("empty library still produces a valid README", () => {
    assert.match(renderRootReadme([]), /No solutions synced yet\./);
  });
});

describe("git blob ids", () => {
  test("match git's own hash so unchanged files are skipped", () => {
    // `git hash-object` of "hello\n"
    assert.equal(gitBlobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
    assert.equal(gitBlobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  test("differ when content differs", () => {
    assert.notEqual(gitBlobSha("a"), gitBlobSha("b"));
  });
});
