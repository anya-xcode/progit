// GET/POST/PUT/DELETE /api/problems against the real app and a throwaway database.
import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import Problem from "../../src/models/Problem.js";
import { startTestServer } from "../helpers/testServer.js";

const SHEET_TOTAL = 474;
const TIMEOUT = 120_000;

let server;

before(async () => {
  server = await startTestServer();
}, { timeout: TIMEOUT });

after(async () => {
  await server.close();
});

// A valid custom problem body: "a + b", so it can also be solved for real.
function customBody(overrides = {}) {
  return {
    title: "Sum Of Two Numbers",
    statement: "Read two integers and print their sum.",
    topic: "Math",
    difficulty: "Easy",
    inputFormat: "Two integers separated by a space.",
    outputFormat: "Their sum.",
    constraints: ["-10^9 <= a, b <= 10^9"],
    hints: ["Just add them."],
    examples: [{ input: "2 3", output: "5", explanation: "2 + 3 = 5" }],
    tags: ["math", "custom"],
    testCases: [
      { input: "2 3\n", expectedOutput: "5\n", isHidden: false },
      { input: "-4 10\n", expectedOutput: "6\n", isHidden: true },
    ],
    ...overrides,
  };
}

const ADD_TWO = `import sys

a, b = (int(x) for x in sys.stdin.read().split())
print(a + b)
`;

describe("GET /api/problems (the library)", () => {
  test("returns the whole A2Z sheet with derived status and counts", async () => {
    const { status, data } = await server.get("/problems");

    assert.equal(status, 200);
    assert.equal(data.total, SHEET_TOTAL);
    assert.equal(data.problems.length, SHEET_TOTAL);

    for (const row of data.problems) {
      assert.equal(row.status, "unsolved", `${row.slug} should start unsolved`);
      assert.equal(row.solutionCount, 0, `${row.slug} should start with no approaches`);
      assert.ok(
        ["ready", "reference", "placeholder"].includes(row.contentStatus),
        `${row.slug} has contentStatus ${row.contentStatus}`
      );
    }
  });

  test("is ordered by step and then by position inside the step", async () => {
    const { data } = await server.get("/problems");
    assert.equal(data.problems[0].problemNumber, 1);
    for (let i = 1; i < data.problems.length; i++) {
      const previous = data.problems[i - 1];
      const current = data.problems[i];
      assert.ok(
        current.sectionOrder > previous.sectionOrder ||
          (current.sectionOrder === previous.sectionOrder && current.orderInSection >= previous.orderInSection),
        `out of order at ${current.slug}`
      );
    }
  });

  test("list rows never carry statements or test cases", async () => {
    const { data } = await server.get("/problems?section=Arrays");
    assert.equal(data.problems[0].statement, undefined);
    assert.equal(data.problems[0].testCases, undefined);
  });
});

describe("GET /api/problems?ready=true", () => {
  // The seeded library currently has no placeholders, so one sheet entry is
  // turned into a placeholder in the throwaway database (never in the YAML).
  const victim = "count-palindromic-subsequences";
  let restore;

  before(async () => {
    const original = await Problem.findOne({ slug: victim }).lean();
    restore = { contentStatus: original.contentStatus, testCases: original.testCases };
    await Problem.updateOne({ slug: victim }, { $set: { contentStatus: "placeholder", testCases: [] } });
  });

  after(async () => {
    await Problem.updateOne({ slug: victim }, { $set: restore });
  });

  test("placeholders are still listed by default", async () => {
    const { data } = await server.get("/problems");
    assert.equal(data.total, SHEET_TOTAL);
    assert.equal(data.problems.filter((p) => p.contentStatus === "placeholder").length, 1);
  });

  test("ready=true keeps only the entries that can actually be solved", async () => {
    const all = (await server.get("/problems")).data.problems;
    const ready = all.filter((p) => p.contentStatus === "ready");
    assert.equal(all.filter((p) => p.contentStatus === "reference").length, 20, "the sheet has 20 theory entries");
    assert.equal(ready.length, SHEET_TOTAL - 21, "474 entries, minus 20 reference entries and the placeholder");

    const { status, data } = await server.get("/problems?ready=true");
    assert.equal(status, 200);
    assert.equal(data.total, ready.length);
    assert.equal(data.problems.length, ready.length);
    assert.ok(data.problems.every((p) => p.contentStatus === "ready"));
    assert.equal(data.problems.some((p) => p.slug === victim), false, "the placeholder is gone");
    assert.equal(data.problems.some((p) => p.slug === "stl"), false, "reference entries are gone too");
    assert.deepEqual(data.problems.map((p) => p.slug), ready.map((p) => p.slug), "the order is unchanged");
  });
});

describe("GET /api/problems (filters)", () => {
  test("by section", async () => {
    const { data } = await server.get("/problems?section=Arrays");
    assert.equal(data.total, 40);
    assert.ok(data.problems.every((p) => p.section === "Arrays"));
  });

  test("by difficulty", async () => {
    const easy = await server.get("/problems?difficulty=Easy");
    const medium = await server.get("/problems?difficulty=Medium");
    const hard = await server.get("/problems?difficulty=Hard");

    assert.equal(easy.data.total, 151);
    assert.equal(medium.data.total, 187);
    assert.equal(hard.data.total, 136);
    assert.equal(easy.data.total + medium.data.total + hard.data.total, SHEET_TOTAL);
    assert.ok(hard.data.problems.every((p) => p.difficulty === "Hard"));
  });

  test("by topic", async () => {
    const { data } = await server.get("/problems?topic=Hashing");
    assert.deepEqual(
      data.problems.map((p) => p.title).sort(),
      ["Basic Hashing", "Frequency Queries", "Highest Occurring Element in an Array", "Two Sum"]
    );
  });

  test("an unknown filter value returns an empty list, not an error", async () => {
    const { status, data } = await server.get("/problems?section=Nonexistent%20Step");
    assert.equal(status, 200);
    assert.deepEqual(data, { problems: [], total: 0 });
  });

  test("filters combine", async () => {
    const both = await server.get("/problems?section=Arrays&difficulty=Easy");
    assert.equal(both.data.total, 14);
    assert.ok(both.data.problems.every((p) => p.section === "Arrays" && p.difficulty === "Easy"));

    const all3 = await server.get("/problems?section=Arrays&difficulty=Easy&topic=Hashing");
    assert.deepEqual(all3.data.problems.map((p) => p.slug), ["two-sum"]);
  });

  describe("by status", () => {
    let twoSumId;
    let solutionId;

    before(async () => {
      twoSumId = (await server.get("/problems/two-sum")).data._id;
      const created = await server.post("/solutions", {
        problemId: twoSumId,
        title: "Status Probe",
        code: "print(1)\n",
      });
      assert.equal(created.status, 201);
      solutionId = created.data._id;
    });

    after(async () => {
      await server.del(`/solutions/${solutionId}`);
    });

    test("a saved approach makes the problem attempted", async () => {
      const attempted = await server.get("/problems?status=attempted");
      assert.equal(attempted.data.total, 1);
      assert.equal(attempted.data.problems[0].slug, "two-sum");
      assert.equal(attempted.data.problems[0].solutionCount, 1);

      const unsolved = await server.get("/problems?status=unsolved");
      assert.equal(unsolved.data.total, SHEET_TOTAL - 1);

      const solved = await server.get("/problems?status=solved");
      assert.deepEqual(solved.data, { problems: [], total: 0 });
    });

    test("status combines with the other filters", async () => {
      const { data } = await server.get("/problems?status=attempted&section=Binary%20Search");
      assert.deepEqual(data, { problems: [], total: 0 });
    });
  });
});

describe("GET /api/problems (search)", () => {
  test("a single word matches anywhere in the slug", async () => {
    const { data } = await server.get("/problems?search=two-sum");
    assert.ok(data.total >= 1);
    assert.equal(data.problems[0].slug, "two-sum");
    assert.ok(data.problems.every((p) => /two-sum/i.test(p.slug)), "every hit must contain the term");
  });

  test("a word that matches a single title", async () => {
    const { data } = await server.get("/problems?search=palindromic%20subsequences");
    assert.deepEqual(data.problems.map((p) => p.slug), ["count-palindromic-subsequences"]);
  });

  test("every word must match, in any order", async () => {
    const forwards = await server.get("/problems?search=two%20sum");
    const backwards = await server.get("/problems?search=sum%20two");

    assert.deepEqual(
      forwards.data.problems.map((p) => p.slug).sort(),
      backwards.data.problems.map((p) => p.slug).sort()
    );
    assert.ok(backwards.data.problems.some((p) => p.slug === "two-sum"), '"sum two" should find Two Sum');
    assert.ok(backwards.data.problems.every((p) => /two/i.test(JSON.stringify(p))));
  });

  test("search is case insensitive", async () => {
    const { data } = await server.get("/problems?search=TWO%20SUM");
    assert.ok(data.problems.some((p) => p.slug === "two-sum"));
  });

  test("matches tags and topics, not just titles", async () => {
    const { data } = await server.get("/problems?search=hashing");
    assert.ok(data.total >= 4);
    assert.ok(data.problems.some((p) => p.slug === "two-sum"));
  });

  test("#25 and 25 both find problem number 25", async () => {
    const hash = await server.get("/problems?search=%2325");
    const plain = await server.get("/problems?search=25");

    assert.deepEqual(hash.data.problems.map((p) => p.problemNumber), [25]);
    assert.deepEqual(plain.data.problems.map((p) => p.problemNumber), [25]);
    assert.equal(hash.data.problems[0].slug, plain.data.problems[0].slug);
  });

  test("no match returns an empty list so the UI can say “Question not found”", async () => {
    const { status, data } = await server.get("/problems?search=qwertyuiop%20nonsense");
    assert.equal(status, 200);
    assert.deepEqual(data, { problems: [], total: 0 });
  });

  test("regex characters in the search are treated literally", async () => {
    const { status, data } = await server.get("/problems?search=%28%5B");
    assert.equal(status, 200);
    assert.equal(data.total, 0);
  });

  test("an empty search returns everything", async () => {
    const { data } = await server.get("/problems?search=%20%20");
    assert.equal(data.total, SHEET_TOTAL);
  });
});

describe("GET /api/problems/meta", () => {
  test("describes the 18 steps of the sheet", async () => {
    const { status, data } = await server.get("/problems/meta");

    assert.equal(status, 200);
    assert.equal(data.steps.length, 18);
    assert.deepEqual(data.steps.map((s) => s.stepNo), Array.from({ length: 18 }, (_, i) => i + 1));
    assert.equal(data.steps.reduce((sum, step) => sum + step.total, 0), SHEET_TOTAL);

    for (const step of data.steps) {
      assert.equal(typeof step.name, "string");
      assert.ok(step.name.length > 0, `step ${step.stepNo} has no name`);
      assert.equal(typeof step.fullTitle, "string");
      assert.ok(step.fullTitle.length > 0, `step ${step.stepNo} has no full title`);
      assert.ok(Array.isArray(step.subSteps), `step ${step.stepNo} has no subSteps`);
      assert.ok(step.subSteps.length > 0, `step ${step.stepNo} has no sub-steps`);
      assert.equal(
        step.subSteps.reduce((sum, sub) => sum + sub.count, 0),
        step.total,
        `step ${step.stepNo} sub-step counts do not add up`
      );
    }

    const arrays = data.steps.find((s) => s.name === "Arrays");
    assert.equal(arrays.stepNo, 3);
    assert.equal(arrays.total, 40);
  });

  test("lists the sections, difficulties and topics used by the filters", async () => {
    const { data } = await server.get("/problems/meta");

    assert.deepEqual(data.sections, data.steps.map((s) => s.name));
    assert.deepEqual(data.difficulties, ["Easy", "Medium", "Hard"]);
    assert.deepEqual(data.topics, [...data.topics].sort(), "topics should be sorted");
    assert.equal(data.topics.includes(""), false, "empty topics should be dropped");
    for (const topic of ["Hashing", "Graphs", "Dynamic Programming"]) {
      assert.ok(data.topics.includes(topic), `topics should include ${topic}`);
    }

    // Every topic really is filterable.
    const { data: filtered } = await server.get(`/problems?topic=${encodeURIComponent(data.topics[0])}`);
    assert.ok(filtered.total > 0);
  });
});

describe("GET /api/problems/:slug", () => {
  test("returns the full problem", async () => {
    const { status, data } = await server.get("/problems/two-sum");

    assert.equal(status, 200);
    assert.equal(data.title, "Two Sum");
    assert.equal(data.slug, "two-sum");
    assert.equal(data.difficulty, "Easy");
    assert.equal(data.section, "Arrays");
    assert.equal(data.topic, "Hashing");
    assert.equal(data.contentStatus, "ready");
    assert.equal(data.status, "unsolved");
    assert.equal(data.solutionCount, 0);
    assert.deepEqual(data.supportedLanguages, ["python"]);
    assert.ok(data.statement.length > 40);
    assert.ok(data.starterCode.python.includes("# --- Input/output handling ---"));
    assert.ok(data.examples.length >= 1);
  });

  test("hidden test cases are never exposed — only their count", async () => {
    const stored = await Problem.findOne({ slug: "two-sum" }).lean();
    const hidden = stored.testCases.filter((t) => t.isHidden);
    assert.ok(hidden.length > 0, "fixture problem must have hidden tests");

    const { data, ...response } = await server.get("/problems/two-sum");

    assert.equal(data.hiddenTestCount, hidden.length);
    assert.equal(data.testCases.length, stored.testCases.length - hidden.length);
    assert.ok(data.testCases.every((t) => t.isHidden === false));
    assert.deepEqual(
      data.testCases,
      stored.testCases
        .filter((t) => !t.isHidden)
        .map((t) => ({ input: t.input, expectedOutput: t.expectedOutput, isHidden: false }))
    );

    // No hidden input may appear anywhere in the payload.
    const payload = JSON.stringify(data);
    for (const test of hidden) {
      const encoded = JSON.stringify(test.input).slice(1, -1);
      assert.equal(payload.includes(encoded), false, `the input of a hidden case leaked: ${encoded.slice(0, 40)}`);
    }
    assert.equal(response.status, 200);
  });

  test("?includeHidden=true cannot unlock a library problem's hidden tests", async () => {
    const { data } = await server.get("/problems/two-sum?includeHidden=true");
    assert.equal(data.testCases.length, 2);
    assert.equal(data.hiddenTestCount, 4);
    assert.ok(data.testCases.every((t) => t.isHidden === false));
  });

  test("the reference solution is never shipped to the client", async () => {
    const { data } = await server.get("/problems/two-sum");
    assert.equal(data.referenceSolution, undefined);
  });

  test("reference entries have no tests to run", async () => {
    const { status, data } = await server.get("/problems/stl");
    assert.equal(status, 200);
    assert.equal(data.contentStatus, "reference");
    assert.deepEqual(data.testCases, []);
    assert.equal(data.hiddenTestCount, 0);
  });

  test("an unknown slug is a 404 with a message", async () => {
    const { status, data } = await server.get("/problems/not-a-real-problem");
    assert.equal(status, 404);
    assert.equal(data.message, "Question not found in your library.");
  });
});

describe("PUT /api/problems/:id/done (reference entries)", () => {
  let referenceId;
  let twoSumId;

  before(async () => {
    referenceId = (await server.get("/problems/stl")).data._id;
    twoSumId = (await server.get("/problems/two-sum")).data._id;
  });

  test("marking done makes the entry solved everywhere", async () => {
    const { status, data } = await server.put(`/problems/${referenceId}/done`, {});

    assert.equal(status, 200);
    assert.equal(data._id, referenceId);
    assert.equal(data.status, "solved");
    assert.notEqual(data.manualDoneAt, null);

    const detail = await server.get("/problems/stl");
    assert.equal(detail.data.status, "solved");

    const list = await server.get("/problems?status=solved");
    assert.deepEqual(list.data.problems.map((p) => p.slug), ["stl"]);

    const stats = await server.get("/dashboard/stats");
    assert.equal(stats.data.solvedProblems, 1);
  });

  test("{ done: false } unticks it", async () => {
    const { status, data } = await server.put(`/problems/${referenceId}/done`, { done: false });

    assert.equal(status, 200);
    assert.equal(data.manualDoneAt, null);
    assert.equal(data.status, "unsolved");

    const detail = await server.get("/problems/stl");
    assert.equal(detail.data.status, "unsolved");

    const stats = await server.get("/dashboard/stats");
    assert.equal(stats.data.solvedProblems, 0);
  });

  test("a normal problem cannot be ticked off", async () => {
    const { status, data } = await server.put(`/problems/${twoSumId}/done`, {});
    assert.equal(status, 400);
    assert.equal(data.message, "Only reference items can be marked as done. Solve this problem by submitting code.");

    const detail = await server.get("/problems/two-sum");
    assert.equal(detail.data.status, "unsolved");
  });

  test("unknown and malformed ids are rejected", async () => {
    const missing = await server.put("/problems/000000000000000000000000/done", {});
    assert.equal(missing.status, 404);
    assert.equal(missing.data.message, "Problem not found");

    const invalid = await server.put("/problems/not-an-id/done", {});
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.message, "Invalid id");
  });
});

describe("custom problems", () => {
  let created;

  test("POST /api/problems creates one", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/problems", customBody());
    created = data;

    assert.equal(status, 201);
    assert.equal(data.title, "Sum Of Two Numbers");
    assert.equal(data.slug, "sum-of-two-numbers");
    assert.equal(data.isCustom, true);
    assert.equal(data.contentStatus, "ready");
    assert.equal(data.section, "Custom");
    assert.equal(data.sectionOrder, 99);
    assert.equal(data.problemNumber, 1001);
    assert.equal(data.difficulty, "Easy");
    assert.equal(data.topic, "Math");
    assert.deepEqual(data.tags, ["math", "custom"]);
    assert.equal(data.testCases.length, 2);
    assert.deepEqual(data.supportedLanguages, ["python"]);
    assert.ok(data.starterCode.python.includes("# --- Input/output handling ---"));
  });

  test("it joins the library and gets its own meta step", async () => {
    const list = await server.get("/problems");
    assert.equal(list.data.total, SHEET_TOTAL + 1);
    const row = list.data.problems.find((p) => p.slug === "sum-of-two-numbers");
    assert.equal(row.isCustom, true);
    assert.equal(row.status, "unsolved");

    const found = await server.get("/problems?search=sum%20of%20two");
    assert.ok(found.data.problems.some((p) => p.slug === "sum-of-two-numbers"));

    const meta = await server.get("/problems/meta");
    const custom = meta.data.steps.find((s) => s.stepNo === 99);
    assert.equal(custom.name, "Custom");
    assert.equal(custom.total, 1);

    const detail = await server.get("/problems/sum-of-two-numbers");
    assert.equal(detail.data.hiddenTestCount, 1);
    assert.equal(detail.data.testCases.length, 1);

    // The edit form is allowed to see its own hidden cases.
    const editing = await server.get("/problems/sum-of-two-numbers?includeHidden=true");
    assert.equal(editing.data.testCases.length, 2);
    assert.equal(editing.data.testCases.filter((t) => t.isHidden).length, 1);
  });

  test("it can actually be solved", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/code/submit", {
      problemId: created._id,
      code: ADD_TWO,
      language: "python",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Accepted");
    assert.equal(data.passedCount, 2);
    assert.equal(data.totalCount, 2);

    const detail = await server.get("/problems/sum-of-two-numbers");
    assert.equal(detail.data.status, "solved");
  });

  test("PUT updates it and renames the slug", async () => {
    const { status, data } = await server.put(`/problems/${created._id}`, customBody({
      title: "Add Two Integers",
      difficulty: "Medium",
      sourceUrl: "https://example.com/add",
    }));

    assert.equal(status, 200);
    assert.equal(data.title, "Add Two Integers");
    assert.equal(data.slug, "add-two-integers");
    assert.equal(data.difficulty, "Medium");
    assert.equal(data.sourceUrl, "https://example.com/add");
    assert.equal(data.problemNumber, 1001, "renaming must not renumber the problem");

    assert.equal((await server.get("/problems/sum-of-two-numbers")).status, 404);
    assert.equal((await server.get("/problems/add-two-integers")).status, 200);
  });

  test("DELETE removes it with its approaches and submissions", async () => {
    const approach = await server.post("/solutions", {
      problemId: created._id,
      title: "Straightforward",
      code: ADD_TWO,
    });
    assert.equal(approach.status, 201);

    const before = await server.get(`/submissions?problemId=${created._id}`);
    assert.equal(before.data.length, 1, "the accepted submit should still be on file");

    const { status, data } = await server.del(`/problems/${created._id}`);
    assert.equal(status, 200);
    assert.equal(data.message, "Problem deleted");

    assert.equal((await server.get("/problems/add-two-integers")).status, 404);
    assert.deepEqual((await server.get(`/solutions/${created._id}`)).data, []);
    assert.deepEqual((await server.get(`/submissions?problemId=${created._id}`)).data, []);
    assert.equal((await server.get("/problems")).data.total, SHEET_TOTAL);
    assert.equal((await server.get("/solutions")).data.length, 0);

    const meta = await server.get("/problems/meta");
    assert.equal(meta.data.steps.some((s) => s.stepNo === 99), false);
  });

  test("custom problems are numbered from 1001 upwards", async () => {
    const first = await server.post("/problems", customBody({ title: "Custom Alpha" }));
    const second = await server.post("/problems", customBody({ title: "Custom Beta" }));

    try {
      assert.equal(first.data.problemNumber, 1001);
      assert.equal(second.data.problemNumber, 1002);
      assert.equal(second.data.orderInSection, 1002);
    } finally {
      await server.del(`/problems/${first.data._id}`);
      await server.del(`/problems/${second.data._id}`);
    }
  });

  test("a duplicate title gets a distinct slug", async () => {
    const first = await server.post("/problems", customBody({ title: "Twin Title" }));
    const second = await server.post("/problems", customBody({ title: "Twin Title" }));

    try {
      assert.equal(first.data.slug, "twin-title");
      assert.equal(second.data.slug, "twin-title-2");
    } finally {
      await server.del(`/problems/${first.data._id}`);
      await server.del(`/problems/${second.data._id}`);
    }
  });
});

describe("custom problem validation", () => {
  const cases = [
    ["a missing title", { title: "" }, "Title is required"],
    ["a missing statement", { statement: "   " }, "Problem statement is required"],
    ["a missing topic", { topic: "" }, "Topic is required"],
    ["an unknown difficulty", { difficulty: "Impossible" }, "Difficulty must be one of Easy, Medium, Hard"],
    ["no test cases", { testCases: [] }, "Add at least one test case with an expected output"],
    [
      "a test case without an expected output",
      { testCases: [{ input: "1 2\n", expectedOutput: "  \n" }] },
      "Every test case needs an expected output",
    ],
    [
      "a source URL that is not a link",
      { sourceUrl: "leetcode.com/problems/two-sum" },
      "Source URL must start with http:// or https://",
    ],
  ];

  for (const [name, override, message] of cases) {
    test(`POST rejects ${name}`, async () => {
      const { status, data } = await server.post("/problems", customBody(override));
      assert.equal(status, 400, `expected 400 for ${name}, got ${status}`);
      assert.equal(data.message, message);
    });
  }

  test("an empty body is rejected before anything is created", async () => {
    const { status, data } = await server.post("/problems", {});
    assert.equal(status, 400);
    assert.equal(data.message, "Title is required");
    assert.equal((await server.get("/problems")).data.total, 474);
  });

  test("PUT validates the same way", async () => {
    const created = await server.post("/problems", customBody({ title: "Validation Target" }));
    try {
      const { status, data } = await server.put(`/problems/${created.data._id}`, customBody({ difficulty: "Extreme" }));

      assert.equal(status, 400);
      assert.equal(data.message, "Difficulty must be one of Easy, Medium, Hard");
      assert.equal((await server.get("/problems/validation-target")).data.difficulty, "Easy");
    } finally {
      await server.del(`/problems/${created.data._id}`);
    }
  });
});

describe("library problems are read-only", () => {
  let twoSumId;

  before(async () => {
    twoSumId = (await server.get("/problems/two-sum")).data._id;
  });

  test("PUT is forbidden", async () => {
    const { status, data } = await server.put(`/problems/${twoSumId}`, customBody({ title: "Hacked" }));
    assert.equal(status, 403);
    assert.equal(data.message, "Library problems are read-only. Edit backend/src/data/problems instead.");
    assert.equal((await server.get("/problems/two-sum")).data.title, "Two Sum");
  });

  test("DELETE is forbidden", async () => {
    const { status, data } = await server.del(`/problems/${twoSumId}`);
    assert.equal(status, 403);
    assert.equal(data.message, "Library problems cannot be deleted");
    assert.equal((await server.get("/problems")).data.total, SHEET_TOTAL);
  });

  test("unknown ids are 404, malformed ids are 400", async () => {
    assert.equal((await server.put("/problems/000000000000000000000000", customBody())).status, 404);
    assert.equal((await server.del("/problems/000000000000000000000000")).status, 404);
    assert.equal((await server.put("/problems/nope", customBody())).status, 400);
    assert.equal((await server.del("/problems/nope")).status, 400);
  });
});
