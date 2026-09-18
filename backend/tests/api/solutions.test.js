// /api/solutions — saved approaches, one problem can have many.
import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import { PYTHON, startTestServer } from "../helpers/testServer.js";

const TIMEOUT = 120_000;

let server;
let twoSum;
let threeSum;

before(async () => {
  server = await startTestServer();
  twoSum = (await server.get("/problems/two-sum")).data;
  threeSum = (await server.get("/problems/3-sum")).data;
  assert.equal(twoSum.slug, "two-sum");
  assert.equal(threeSum.slug, "3-sum");
}, { timeout: TIMEOUT });

after(async () => {
  await server.close();
});

describe("POST /api/solutions", () => {
  let hashMapId;

  test("creates an approach", async () => {
    const { status, data } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Hash Map",
      code: PYTHON.twoSumAccepted,
      language: "python",
      approach: "Optimal",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      explanation: "One pass with a seen map.",
    });
    hashMapId = data._id;

    assert.equal(status, 201);
    assert.equal(data.title, "Hash Map");
    assert.equal(data.slug, "hash-map");
    assert.equal(data.problemId, twoSum._id);
    assert.equal(data.approach, "Optimal");
    assert.equal(data.language, "python");
    assert.equal(data.code, PYTHON.twoSumAccepted);
    assert.equal(data.timeComplexity, "O(n)");
    assert.equal(data.spaceComplexity, "O(n)");
    assert.equal(data.explanation, "One pass with a seen map.");
    assert.equal(data.verdict, "Not Submitted");
    assert.equal(data.runtime, null);
    assert.equal(data.memory, null);
    assert.equal(data.isDraft, true);
    assert.equal(data.lastSubmittedAt, null);
    assert.equal(data.githubStatus, "not-synced");
    assert.equal(data.githubPath, "");
  });

  test("defaults the approach type and language", async () => {
    const { data } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Brute Force",
      code: "print(0, 1)\n",
    });
    assert.equal(data.approach, "Other");
    assert.equal(data.language, "python");
    assert.equal(data.slug, "brute-force");
  });

  test("GET /api/solutions/:problemId lists them with code, oldest first", async () => {
    const { status, data } = await server.get(`/solutions/${twoSum._id}`);

    assert.equal(status, 200);
    assert.deepEqual(data.map((s) => s.title), ["Hash Map", "Brute Force"]);
    assert.equal(data[0].code, PYTHON.twoSumAccepted);
    assert.equal(data[1].code, "print(0, 1)\n");
  });

  test("GET /api/solutions lists every approach without code", async () => {
    const { status, data } = await server.get("/solutions");

    assert.equal(status, 200);
    assert.equal(data.length, 2);
    for (const solution of data) {
      assert.equal(solution.code, undefined, "My Solutions must not ship every approach's code");
      assert.equal(solution.problemId.title, "Two Sum");
      assert.equal(solution.problemId.slug, "two-sum");
      assert.equal(solution.problemId.difficulty, "Easy");
    }
    assert.deepEqual(data.map((s) => s.title), ["Brute Force", "Hash Map"], "newest first");
  });

  test("a duplicate approach name for the same problem is a 409", async () => {
    const { status, data } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Hash Map",
      code: "print(1)\n",
    });

    assert.equal(status, 409);
    assert.equal(data.message, 'An approach named "Hash Map" already exists for this problem. Choose a different name.');
    assert.equal((await server.get(`/solutions/${twoSum._id}`)).data.length, 2, "nothing was created");
  });

  test("names that differ only in case or punctuation are still duplicates", async () => {
    const { status } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "  hash   map  ",
      code: "print(1)\n",
    });
    assert.equal(status, 409);
  });

  test("the same name on a different problem is fine", async () => {
    const { status, data } = await server.post("/solutions", {
      problemId: threeSum._id,
      title: "Hash Map",
      code: "print(0)\n",
    });

    assert.equal(status, 201);
    assert.equal(data.slug, "hash-map");
    assert.notEqual(data._id, hashMapId);
    assert.equal((await server.get(`/solutions/${threeSum._id}`)).data.length, 1);
    assert.equal((await server.get("/solutions")).data.length, 3);
  });

  test("the list can be searched and filtered by verdict", async () => {
    const byName = await server.get("/solutions?search=brute");
    assert.deepEqual(byName.data.map((s) => s.title), ["Brute Force"]);

    const byProblem = await server.get("/solutions?search=3sum");
    assert.deepEqual(byProblem.data.map((s) => s.problemId.slug), ["3-sum"]);

    const accepted = await server.get("/solutions?verdict=Accepted");
    assert.deepEqual(accepted.data, []);

    const unsubmitted = await server.get("/solutions?verdict=Not%20Submitted");
    assert.equal(unsubmitted.data.length, 3);
  });
});

describe("PUT /api/solutions/:id", () => {
  let solution;

  before(async () => {
    solution = (await server.get(`/solutions/${twoSum._id}`)).data.find((s) => s.title === "Brute Force");
  });

  test("updates the details and leaves the code alone", async () => {
    const { status, data } = await server.put(`/solutions/${solution._id}`, {
      approach: "Brute Force",
      timeComplexity: "O(n^2)",
      spaceComplexity: "O(1)",
      explanation: "Check every pair.",
    });

    assert.equal(status, 200);
    assert.equal(data.approach, "Brute Force");
    assert.equal(data.timeComplexity, "O(n^2)");
    assert.equal(data.spaceComplexity, "O(1)");
    assert.equal(data.explanation, "Check every pair.");
    assert.equal(data.code, solution.code, "the code must be untouched");
    assert.equal(data.title, "Brute Force");
  });

  test("renaming to a name that already exists is a 409", async () => {
    const { status, data } = await server.put(`/solutions/${solution._id}`, { title: "Hash Map" });

    assert.equal(status, 409);
    assert.equal(data.message, 'An approach named "Hash Map" already exists for this problem. Choose a different name.');
    assert.equal((await server.get(`/solutions/${twoSum._id}`)).data.find((s) => s._id === solution._id).title, "Brute Force");
  });

  test("renaming to a free name updates the slug", async () => {
    const { status, data } = await server.put(`/solutions/${solution._id}`, { title: "Nested Loops" });

    assert.equal(status, 200);
    assert.equal(data.title, "Nested Loops");
    assert.equal(data.slug, "nested-loops");

    // The old name is free again.
    const reuse = await server.post("/solutions", { problemId: twoSum._id, title: "Brute Force", code: "print(2)\n" });
    assert.equal(reuse.status, 201);
    await server.del(`/solutions/${reuse.data._id}`);
  });
});

describe("solution validation", () => {
  const badBodies = [
    ["no problemId", { title: "X", code: "print(1)\n" }, 400, "A valid problemId is required"],
    ["a malformed problemId", { problemId: "not-an-id", title: "X", code: "print(1)\n" }, 400, "A valid problemId is required"],
    [
      "a well-formed but unknown problemId",
      { problemId: "000000000000000000000000", title: "X", code: "print(1)\n" },
      404,
      "Problem not found",
    ],
  ];

  for (const [name, body, expectedStatus, message] of badBodies) {
    test(`POST with ${name} → ${expectedStatus}`, async () => {
      const { status, data } = await server.post("/solutions", body);
      assert.equal(status, expectedStatus);
      assert.equal(data.message, message);
    });
  }

  const fieldErrors = [
    ["a missing approach name", { title: "" }, "Approach name is required"],
    ["a name with no letters or numbers", { title: "***" }, "Approach name must contain letters or numbers"],
    ["missing code", { title: "No Code", code: undefined }, "Code is required"],
    ["blank code", { title: "Blank Code", code: "   \n " }, "Code is required"],
    ["code over 64 KB", { title: "Huge", code: `#${"x".repeat(64_000)}` }, "Code is too long (64 KB max)"],
    ["an unknown language", { title: "Ruby", code: "puts 1", language: "ruby" }, 'Language "ruby" is not supported yet'],
    [
      "a language that is not enabled yet",
      { title: "Cpp", code: "int main(){}", language: "cpp" },
      'Language "cpp" is not supported yet',
    ],
    [
      "an unknown approach type",
      { title: "Weird", code: "print(1)\n", approach: "Magical" },
      "Approach type must be one of Brute Force, Better, Optimal, Other",
    ],
  ];

  for (const [name, override, message] of fieldErrors) {
    test(`POST rejects ${name}`, async () => {
      const body = { problemId: twoSum._id, title: "Placeholder", code: "print(1)\n", ...override };
      if ("code" in override && override.code === undefined) delete body.code;
      const { status, data } = await server.post("/solutions", body);

      assert.equal(status, 400, `expected 400 for ${name}, got ${status}`);
      assert.equal(data.message, message);
    });
  }

  test("code of exactly 64 KB is accepted", async () => {
    const code = `#${"x".repeat(63_998)}\n`;
    assert.equal(code.length, 64_000);
    const { status, data } = await server.post("/solutions", { problemId: twoSum._id, title: "Exactly 64K", code });

    assert.equal(status, 201);
    assert.equal(data.code.length, 64_000);
    await server.del(`/solutions/${data._id}`);
  });

  test("GET /api/solutions/:problemId rejects a malformed id but is happy with an unknown one", async () => {
    const malformed = await server.get("/solutions/not-an-id");
    assert.equal(malformed.status, 400);
    assert.equal(malformed.data.message, "Invalid problemId");

    const unknown = await server.get("/solutions/000000000000000000000000");
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.data, []);
  });

  test("PUT and DELETE separate malformed ids (400) from unknown ones (404)", async () => {
    const malformedPut = await server.put("/solutions/not-an-id", { title: "X" });
    assert.equal(malformedPut.status, 400);
    assert.equal(malformedPut.data.message, "Invalid id");

    const unknownPut = await server.put("/solutions/000000000000000000000000", { title: "X" });
    assert.equal(unknownPut.status, 404);
    assert.equal(unknownPut.data.message, "Solution not found");

    const malformedDelete = await server.del("/solutions/not-an-id");
    assert.equal(malformedDelete.status, 400);
    assert.equal(malformedDelete.data.message, "Invalid id");

    const unknownDelete = await server.del("/solutions/000000000000000000000000");
    assert.equal(unknownDelete.status, 404);
    assert.equal(unknownDelete.data.message, "Solution not found");
  });

  test("failed validation created nothing", async () => {
    assert.equal((await server.get("/solutions")).data.length, 3);
  });
});

describe("saving code that was just submitted", () => {
  let submission;
  let saved;

  before(async () => {
    const run = await server.post("/code/submit", {
      problemId: twoSum._id,
      code: PYTHON.twoSumAccepted,
      language: "python",
    });
    assert.equal(run.status, 201);
    assert.equal(run.data.verdict, "Accepted");
    submission = (await server.get(`/submissions/${run.data.submissionId}`)).data;
    assert.equal(submission.solutionId, null, "an unsaved submit is not linked to an approach");
  }, { timeout: TIMEOUT });

  test("a submissionId whose code no longer matches is ignored", { timeout: TIMEOUT }, async () => {
    const { status, data } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Edited After Submitting",
      code: `${PYTHON.twoSumAccepted}# edited after the run\n`,
      submissionId: submission._id,
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Not Submitted");
    assert.equal(data.runtime, null);
    assert.equal(data.memory, null);
    assert.equal(data.isDraft, true);
    assert.equal(data.lastSubmittedAt, null);

    const stillUnlinked = await server.get(`/submissions/${submission._id}`);
    assert.equal(stillUnlinked.data.solutionId, null);

    await server.del(`/solutions/${data._id}`);
  });

  test("a malformed submissionId is ignored rather than fatal", async () => {
    const { status, data } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "Bad Submission Id",
      code: PYTHON.twoSumAccepted,
      submissionId: "not-an-id",
    });

    assert.equal(status, 201);
    assert.equal(data.verdict, "Not Submitted");
    await server.del(`/solutions/${data._id}`);
  });

  test("a matching submissionId carries the verdict onto the new approach", async () => {
    const { status, data } = await server.post("/solutions", {
      problemId: twoSum._id,
      title: "From Submission",
      code: PYTHON.twoSumAccepted,
      approach: "Optimal",
      submissionId: submission._id,
    });
    saved = data;

    assert.equal(status, 201);
    assert.equal(data.verdict, "Accepted");
    assert.equal(data.runtime, submission.runtime);
    assert.equal(data.memory, submission.memory);
    assert.equal(data.isDraft, false);
    assert.equal(data.lastSubmittedAt, submission.submittedAt);

    const linked = await server.get(`/submissions/${submission._id}`);
    assert.equal(linked.data.solutionId._id, data._id);
    assert.equal(linked.data.solutionId.title, "From Submission");
  });

  test("editing the details of an accepted approach keeps its verdict", async () => {
    const { status, data } = await server.put(`/solutions/${saved._id}`, {
      explanation: "Single pass with a hash map.",
      timeComplexity: "O(n)",
    });

    assert.equal(status, 200);
    assert.equal(data.verdict, "Accepted");
    assert.equal(data.runtime, saved.runtime);
    assert.equal(data.memory, saved.memory);
    assert.equal(data.isDraft, false);
  });

  test("re-saving identical code keeps the verdict too", async () => {
    const { data } = await server.put(`/solutions/${saved._id}`, { code: PYTHON.twoSumAccepted });
    assert.equal(data.verdict, "Accepted");
    assert.equal(data.runtime, saved.runtime);
  });

  test("changing the code resets the verdict and clears runtime and memory", async () => {
    const { status, data } = await server.put(`/solutions/${saved._id}`, {
      code: `${PYTHON.twoSumAccepted}# a small change\n`,
    });

    assert.equal(status, 200);
    assert.equal(data.verdict, "Not Submitted");
    assert.equal(data.runtime, null);
    assert.equal(data.memory, null);
    assert.equal(data.isDraft, true);

    const reloaded = (await server.get(`/solutions/${twoSum._id}`)).data.find((s) => s._id === saved._id);
    assert.equal(reloaded.verdict, "Not Submitted");
    assert.equal(reloaded.code, `${PYTHON.twoSumAccepted}# a small change\n`);
  });

  test("DELETE removes the approach but keeps its submissions, unlinked", async () => {
    const before = (await server.get(`/solutions/${twoSum._id}`)).data.length;

    const { status, data } = await server.del(`/solutions/${saved._id}`);
    assert.equal(status, 200);
    assert.equal(data.message, "Solution deleted");
    assert.equal(data.githubRemovalQueued, false);

    const remaining = (await server.get(`/solutions/${twoSum._id}`)).data;
    assert.equal(remaining.length, before - 1);
    assert.equal(remaining.some((s) => s._id === saved._id), false);

    const orphaned = await server.get(`/submissions/${submission._id}`);
    assert.equal(orphaned.status, 200);
    assert.equal(orphaned.data.solutionId, null);
    assert.equal(orphaned.data.verdict, "Accepted");
    assert.equal(orphaned.data.problemId, twoSum._id);

    const history = await server.get(`/submissions?problemId=${twoSum._id}`);
    assert.equal(history.data.length, 1, "the submission survives the approach");
  });

  test("deleting the same approach twice is a 404", async () => {
    const { status, data } = await server.del(`/solutions/${saved._id}`);
    assert.equal(status, 404);
    assert.equal(data.message, "Solution not found");
  });
});
