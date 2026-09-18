// /api/dashboard — the numbers the Dashboard and Progress pages are built from.
import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import Problem from "../../src/models/Problem.js";
import { PYTHON, startTestServer } from "../helpers/testServer.js";

const SHEET_TOTAL = 474;
const TIMEOUT = 180_000;
const today = new Intl.DateTimeFormat("en-CA").format(new Date());

// The seeded library has no placeholders, so the very first sheet entry is
// turned into one inside the throwaway database: "continue solving" must skip it.
const PLACEHOLDER_SLUG = "input-output";

let server;
let twoSum;
let threeSum;
let fourSum;

before(async () => {
  server = await startTestServer();
  twoSum = (await server.get("/problems/two-sum")).data;
  threeSum = (await server.get("/problems/3-sum")).data;
  fourSum = (await server.get("/problems/4-sum")).data;
  await Problem.updateOne({ slug: PLACEHOLDER_SLUG }, { $set: { contentStatus: "placeholder", testCases: [] } });
}, { timeout: TIMEOUT });

after(async () => {
  await server.close();
});

describe("a fresh database", () => {
  test("GET /api/dashboard/stats counts the library and nothing else", async () => {
    const { status, data } = await server.get("/dashboard/stats");

    assert.equal(status, 200);
    assert.deepEqual(data, {
      totalProblems: SHEET_TOTAL,
      solvedProblems: 0,
      attemptedProblems: 0,
      totalSolutions: 0,
      acceptedSolutions: 0,
      totalSubmissions: 0,
      acceptedSubmissions: 0,
      multiApproachProblems: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  test("GET /api/dashboard/progress mirrors the sheet", async () => {
    const { status, data } = await server.get("/dashboard/progress");

    assert.equal(status, 200);
    assert.equal(data.bySection.length, 18);
    assert.deepEqual(data.bySection.map((s) => s.order), Array.from({ length: 18 }, (_, i) => i + 1));
    assert.equal(data.bySection.reduce((sum, s) => sum + s.total, 0), SHEET_TOTAL);
    assert.ok(data.bySection.every((s) => s.solved === 0));

    const arrays = data.bySection.find((s) => s.section === "Arrays");
    assert.equal(arrays.total, 40);
    const graphs = data.bySection.find((s) => s.section === "Graphs");
    assert.equal(graphs.total, 53);

    assert.deepEqual(data.byDifficulty, [
      { difficulty: "Easy", total: 151, solved: 0 },
      { difficulty: "Medium", total: 187, solved: 0 },
      { difficulty: "Hard", total: 136, solved: 0 },
    ]);
    assert.equal(data.byDifficulty.reduce((sum, d) => sum + d.total, 0), SHEET_TOTAL);
  });

  test("the activity window covers the requested number of days, ending today", async () => {
    const { data } = await server.get("/dashboard/progress?days=30");

    assert.equal(data.activity.length, 30);
    assert.equal(data.activity.at(-1).date, today);
    assert.deepEqual(data.activity.at(-1), { date: today, submissions: 0, accepted: 0 });
    assert.ok(data.activity.every((day) => day.submissions === 0 && day.accepted === 0));

    // Dates are consecutive and in ascending order.
    const dates = data.activity.map((d) => d.date);
    assert.deepEqual(dates, [...dates].sort());
    assert.equal(new Set(dates).size, 30);
  });

  test("the window defaults to 182 days and is clamped to 7…366", async () => {
    assert.equal((await server.get("/dashboard/progress")).data.activity.length, 182);
    assert.equal((await server.get("/dashboard/progress?days=1")).data.activity.length, 7);
    assert.equal((await server.get("/dashboard/progress?days=9999")).data.activity.length, 366);
    assert.equal((await server.get("/dashboard/progress?days=abc")).data.activity.length, 182);
  });

  test("GET /api/dashboard/recent suggests where to start", async () => {
    const { status, data } = await server.get("/dashboard/recent");

    assert.equal(status, 200);
    assert.deepEqual(data.recentSubmissions, []);
    assert.deepEqual(data.recentSolutions, []);
    assert.deepEqual(data.multiApproach, []);
    assert.equal(data.continueSolving.length, 5);
    assert.ok(data.continueSolving.every((p) => p.status === "unsolved"));
  });
});

describe("after saving approaches and submitting", () => {
  let acceptedSolutionId;

  before(async () => {
    const optimal = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Hash Map",
      code: PYTHON.twoSumAccepted,
      approach: "Optimal",
    });
    assert.equal(optimal.status, 201);
    acceptedSolutionId = optimal.data._id;

    const brute = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Brute Force",
      code: "print(0, 1)\n",
      approach: "Brute Force",
    });
    assert.equal(brute.status, 201);

    const other = await server.post("/solutions", {
      problemId: threeSum._id,
      title: "Sorting",
      code: "print(0)\n",
    });
    assert.equal(other.status, 201);

    const accepted = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      language: "python",
      solutionId: acceptedSolutionId,
    });
    assert.equal(accepted.data.verdict, "Accepted");

    const failed = await server.post("/code/submit", {
      problemId: fourSum._id,
      code: PYTHON.wrongAnswer,
      language: "python",
    });
    assert.equal(failed.data.verdict, "Wrong Answer");
  }, { timeout: TIMEOUT });

  test("stats separate solved from attempted and count the streak", async () => {
    const { data } = await server.get("/dashboard/stats");

    assert.deepEqual(data, {
      totalProblems: SHEET_TOTAL,
      solvedProblems: 1,
      attemptedProblems: 2,
      totalSolutions: 3,
      acceptedSolutions: 1,
      totalSubmissions: 2,
      acceptedSubmissions: 1,
      multiApproachProblems: 1,
      currentStreak: 1,
      longestStreak: 1,
    });
  });

  test("progress credits the right section, difficulty and day", async () => {
    const { data } = await server.get("/dashboard/progress?days=30");

    const arrays = data.bySection.find((s) => s.section === twoSum.section);
    assert.equal(arrays.solved, 1);
    assert.equal(data.bySection.reduce((sum, s) => sum + s.solved, 0), 1);
    assert.equal(data.bySection.reduce((sum, s) => sum + s.total, 0), SHEET_TOTAL);

    assert.deepEqual(data.byDifficulty, [
      { difficulty: "Easy", total: 151, solved: 1 },
      { difficulty: "Medium", total: 187, solved: 0 },
      { difficulty: "Hard", total: 136, solved: 0 },
    ]);

    assert.equal(data.activity.length, 30);
    assert.deepEqual(data.activity.at(-1), { date: today, submissions: 2, accepted: 1 });
    assert.ok(
      data.activity.slice(0, -1).every((day) => day.submissions === 0),
      "only today should have activity"
    );
  });

  test("recent submissions carry their problem and approach", async () => {
    const { data } = await server.get("/dashboard/recent");

    assert.equal(data.recentSubmissions.length, 2);
    assert.deepEqual(data.recentSubmissions.map((s) => s.verdict), ["Wrong Answer", "Accepted"], "newest first");

    const [failed, accepted] = data.recentSubmissions;
    assert.equal(failed.problemId.slug, "4-sum");
    assert.equal(failed.problemId.title, fourSum.title);
    assert.equal(failed.solutionId, null, "an unsaved submit has no approach");

    assert.equal(accepted.problemId.slug, "two-sum");
    assert.equal(accepted.problemId.difficulty, "Easy");
    assert.equal(accepted.solutionId._id, acceptedSolutionId);
    assert.equal(accepted.solutionId.title, "Hash Map");
    assert.equal(accepted.passedCount, 6);
    assert.equal(accepted.totalCount, 6);
  });

  test("recent approaches come back newest first, with their problem", async () => {
    const { data } = await server.get("/dashboard/recent");

    assert.equal(data.recentSolutions.length, 3);
    assert.deepEqual(
      data.recentSolutions.map((s) => s.title).sort(),
      ["Brute Force", "Hash Map", "Sorting"]
    );
    for (const solution of data.recentSolutions) {
      assert.equal(solution.code, undefined, "the dashboard must not ship code");
      assert.equal(typeof solution.problemId.title, "string");
      assert.ok(solution.problemId.slug.length > 0);
    }
    assert.equal(data.recentSolutions[0].title, "Hash Map", "the just-submitted approach is the freshest");
  });

  test("continue solving prefers attempted problems and never suggests placeholders", async () => {
    const { data } = await server.get("/dashboard/recent");

    assert.equal(data.continueSolving.length, 5);
    assert.deepEqual(
      data.continueSolving.slice(0, 2).map((p) => p.slug),
      ["4-sum", "3-sum"],
      "most recently touched first"
    );
    assert.ok(data.continueSolving.slice(0, 2).every((p) => p.status === "attempted"));
    assert.ok(data.continueSolving.slice(2).every((p) => p.status === "unsolved"));

    assert.equal(
      data.continueSolving.some((p) => p.slug === "two-sum"),
      false,
      "a solved problem is not a suggestion"
    );
    assert.equal(
      data.continueSolving.some((p) => p.slug === PLACEHOLDER_SLUG),
      false,
      "placeholders cannot be solved, so they must not be suggested"
    );

    // Every filler really is solvable, and they follow the sheet order.
    const fillers = data.continueSolving.slice(2);
    for (const filler of fillers) {
      const detail = await server.get(`/problems/${filler.slug}`);
      assert.equal(detail.data.contentStatus, "ready", `${filler.slug} is not solvable`);
    }
    assert.deepEqual(
      fillers.map((p) => p.problemNumber),
      [...fillers.map((p) => p.problemNumber)].sort((a, b) => a - b)
    );
    assert.ok(fillers[0].problemNumber > 1, "the placeholder at #1 should have been skipped");
  });

  test("multiApproach lists the problem with two approaches", async () => {
    const { data } = await server.get("/dashboard/recent");

    assert.equal(data.multiApproach.length, 1);
    const [entry] = data.multiApproach;
    assert.equal(entry.count, 2);
    assert.equal(entry.problem.slug, "two-sum");
    assert.equal(entry.problem.title, "Two Sum");
    assert.deepEqual([...entry.approaches].sort(), ["Brute Force", "Hash Map"]);
  });

  test("deleting an approach takes it back out of the numbers", async () => {
    const brute = (await server.get(`/solutions/${twoSum._id}`)).data.find((s) => s.title === "Brute Force");
    assert.equal((await server.del(`/solutions/${brute._id}`)).status, 200);

    const stats = await server.get("/dashboard/stats");
    assert.equal(stats.data.totalSolutions, 2);
    assert.equal(stats.data.multiApproachProblems, 0);
    assert.equal(stats.data.solvedProblems, 1, "the accepted submission still counts");

    const recent = await server.get("/dashboard/recent");
    assert.deepEqual(recent.data.multiApproach, []);
  });
});
