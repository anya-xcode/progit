import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import { ENTRIES, similarLeetcode } from "../../src/data/a2z/index.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/data");
const { similar } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "a2z/leetcode.json"), "utf8"));

describe("similar LeetCode problems (leetcode.json)", () => {
  test("every key is a real sheet entry with at least one problem", () => {
    for (const [sheetId, problems] of Object.entries(similar)) {
      assert.ok(ENTRIES.has(sheetId), `unknown sheet entry "${sheetId}"`);
      assert.ok(Array.isArray(problems) && problems.length > 0, `${sheetId} lists no problems; leave the entry out instead`);
    }
  });

  test("every problem has a number, slug, title, difficulty and premium flag", () => {
    for (const [sheetId, problems] of Object.entries(similar)) {
      for (const problem of problems) {
        const where = `${sheetId} → ${problem.slug}`;
        assert.ok(Number.isInteger(problem.id) && problem.id > 0, `${where}: id`);
        assert.match(problem.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${where}: slug`);
        assert.ok(typeof problem.title === "string" && problem.title.trim(), `${where}: title`);
        assert.ok(["Easy", "Medium", "Hard"].includes(problem.difficulty), `${where}: difficulty`);
        assert.equal(typeof problem.premium, "boolean", `${where}: premium`);
      }
    }
  });

  test("an entry never lists the same problem twice", () => {
    for (const [sheetId, problems] of Object.entries(similar)) {
      const slugs = problems.map((problem) => problem.slug);
      assert.equal(new Set(slugs).size, slugs.length, `${sheetId} repeats a problem`);
    }
  });

  test("a LeetCode problem is described the same way wherever it appears", () => {
    const seen = new Map();
    for (const problems of Object.values(similar)) {
      for (const problem of problems) {
        const first = seen.get(problem.slug) ?? problem;
        seen.set(problem.slug, first);
        assert.deepEqual(problem, first, `"${problem.slug}" has two different descriptions`);
      }
    }
  });

  test("similarLeetcode() adds the LeetCode URL, closest match first", () => {
    const twoSum = [...ENTRIES.values()].find((entry) => entry.title === "Two Sum");
    const problems = similarLeetcode(twoSum.sheetId);
    assert.deepEqual(
      problems.map((problem) => problem.url),
      ["https://leetcode.com/problems/two-sum/", "https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/"]
    );
    assert.equal(problems[0].id, 1);
  });

  test("entries without a close match, and custom problems, get an empty list", () => {
    const pattern = [...ENTRIES.values()].find((entry) => entry.title === "Pattern 1");
    assert.deepEqual(similarLeetcode(pattern.sheetId), []);
    assert.deepEqual(similarLeetcode(null), []);
  });
});
