// Cross-cutting error handling: every failure is JSON with a message.
import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import { startTestServer } from "../helpers/testServer.js";

const TIMEOUT = 120_000;

let server;

before(async () => {
  server = await startTestServer();
}, { timeout: TIMEOUT });

after(async () => {
  await server.close();
});

// The harness always sends JSON; these need a raw body.
function raw(path, { method = "POST", body, contentType = "application/json" } = {}) {
  return fetch(server.base + path, {
    method,
    headers: contentType ? { "Content-Type": contentType } : {},
    body,
  });
}

describe("unknown routes", () => {
  test("a route that does not exist is a 404 with a message", async () => {
    const { status, data, headers } = await server.get("/nope");

    assert.equal(status, 404);
    assert.equal(data.message, "Route not found: GET /api/nope");
    assert.match(headers.get("content-type"), /application\/json/);
  });

  test("the method matters", async () => {
    const { status, data } = await server.del("/problems");
    assert.equal(status, 404);
    assert.equal(data.message, "Route not found: DELETE /api/problems");
  });

  test("a nested unknown path is a 404 too", async () => {
    const { status, data } = await server.get("/problems/two-sum/extra");
    assert.equal(status, 404);
    assert.equal(data.message, "Route not found: GET /api/problems/two-sum/extra");
  });

  test("/api/health still answers", async () => {
    const { status, data } = await server.get("/health");
    assert.equal(status, 200);
    assert.equal(data.status, "ok");
    assert.equal(data.database, "connected");
    assert.deepEqual(data.languages.map((l) => l.id), ["python"]);
  });
});

describe("invalid ObjectIds", () => {
  const routes = [
    ["GET", "/solutions/not-an-id", "Invalid problemId"],
    ["PUT", "/solutions/not-an-id", "Invalid id"],
    ["DELETE", "/solutions/not-an-id", "Invalid id"],
    ["GET", "/submissions/not-an-id", "Invalid id"],
    ["PUT", "/problems/not-an-id", "Invalid id"],
    ["DELETE", "/problems/not-an-id", "Invalid id"],
    ["PUT", "/problems/not-an-id/done", "Invalid id"],
    ["POST", "/github/sync/not-an-id", "Invalid solutionId"],
  ];

  for (const [method, path, message] of routes) {
    test(`${method} ${path} → 400`, async () => {
      const { status, data } = await server.request(method, path, method === "GET" ? undefined : {});
      assert.equal(status, 400, `${method} ${path} returned ${status}`);
      assert.equal(data.message, message);
    });
  }

  test("a query-string id is validated too", async () => {
    const { status, data } = await server.get("/submissions?problemId=not-an-id");
    assert.equal(status, 400);
    assert.equal(data.message, "Invalid problemId");
  });

  test("an id that is 24 hex characters but unknown is a 404, not a 400", async () => {
    const { status, data } = await server.get("/submissions/000000000000000000000000");
    assert.equal(status, 404);
    assert.equal(data.message, "Submission not found");
  });
});

describe("request bodies", () => {
  test("malformed JSON is a 400", async () => {
    const response = await raw("/problems", { body: '{"title": ' });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.message, "Request body must be valid JSON");
    assert.match(response.headers.get("content-type"), /application\/json/);
  });

  test("JSON that is not an object is still handled", async () => {
    const response = await raw("/problems", { body: '"just a string"' });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(typeof data.message, "string");
    assert.ok(data.message.length > 0);
  });

  test("a body over the 1 MB limit is a 413", async () => {
    const response = await raw("/problems", { body: JSON.stringify({ title: "x".repeat(1_200_000) }) });
    const data = await response.json();

    assert.equal(response.status, 413);
    assert.equal(data.message, "Request body is too large");
  });

  test("a missing body is handled as an empty one", async () => {
    const { status, data } = await server.post("/problems", undefined);
    assert.equal(status, 400);
    assert.equal(data.message, "Title is required");
  });
});

describe("every error response", () => {
  const failures = [
    ["unknown route", () => server.get("/does/not/exist"), 404],
    ["unknown slug", () => server.get("/problems/no-such-problem"), 404],
    ["unknown submission", () => server.get("/submissions/000000000000000000000000"), 404],
    ["malformed id", () => server.get("/solutions/xyz"), 400],
    ["failed validation", () => server.post("/problems", { title: "Only a title" }), 400],
    ["missing problem", () => server.post("/solutions", { problemId: "000000000000000000000000", title: "A", code: "x" }), 404],
    ["a read-only library problem", async () => server.del(`/problems/${(await server.get("/problems/two-sum")).data._id}`), 403],
    ["a run for a missing problem", () => server.post("/code/run", { problemId: "000000000000000000000000", code: "x" }), 404],
  ];

  for (const [name, call, expectedStatus] of failures) {
    test(`${name} → ${expectedStatus} JSON with a message`, async () => {
      const response = await call();

      assert.equal(response.status, expectedStatus, `${name} returned ${response.status}`);
      assert.match(response.headers.get("content-type"), /application\/json/);
      assert.equal(typeof response.data, "object");
      assert.equal(typeof response.data.message, "string");
      assert.ok(response.data.message.trim().length > 0, `${name} has an empty message`);
      assert.equal(response.data.stack, undefined, "stack traces must not reach the client");
      assert.equal(response.data.error, undefined);
    });
  }

  test("a duplicate approach is a 409 with an explanation", async () => {
    const problem = (await server.get("/problems/two-sum")).data;
    const body = { problemId: problem._id, title: "Only One", code: "print(1)\n" };

    const first = await server.post("/solutions", body);
    assert.equal(first.status, 201);

    const second = await server.post("/solutions", body);
    assert.equal(second.status, 409);
    assert.match(second.headers.get("content-type"), /application\/json/);
    assert.equal(
      second.data.message,
      'An approach named "Only One" already exists for this problem. Choose a different name.'
    );

    await server.del(`/solutions/${first.data._id}`);
  });
});
