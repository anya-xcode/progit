// The remote judge adapters (used when the app is deployed somewhere that
// cannot sandbox locally). Both are driven against a fake judge server so the
// tests never depend on a third-party service.
import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before, describe } from "node:test";

let judge;
let server;
let requests = [];
let respond = () => ({});

before(async () => {
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({ url: req.url, method: req.method, body, headers: req.headers });
    const reply = respond(req, body);
    res.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reply.body ?? {}));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  process.env.PISTON_URL = `${base}/piston`;
  process.env.JUDGE0_URL = `${base}/judge0`;
  process.env.JUDGE0_TOKEN = "secret-token";
  ({ httpJudgeProviders: judge } = await import("../../src/services/execution/providers/httpJudgeProvider.js"));
});

after(() => server.close());

const payload = (tests) => ({
  code: "print(1)\n",
  tests,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  outputLimitKb: 256,
  stopAfterTimeout: true,
});

describe("Piston adapter", () => {
  test("sends one request per test and maps stdout", async () => {
    requests = [];
    respond = (req, body) => ({ body: { run: { stdout: `${body.stdin.trim()}!\n`, stderr: "", code: 0, signal: null } } });

    const result = await judge.piston.run({ payload: payload([{ input: "a" }, { input: "b" }]), timeoutMs: 10_000 });

    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /\/piston\/execute$/);
    assert.equal(requests[0].body.files[0].content, "print(1)\n");
    assert.equal(requests[0].body.run_timeout, 2000);
    assert.deepEqual(result.results.map((r) => r.stdout), ["a!\n", "b!\n"]);
    assert.equal(result.compileError, null);
  });

  test("a killed run is a timeout, and stops the remaining tests", async () => {
    requests = [];
    respond = () => ({ body: { run: { stdout: "", stderr: "", code: null, signal: "SIGKILL" } } });

    const result = await judge.piston.run({ payload: payload([{ input: "a" }, { input: "b" }]), timeoutMs: 10_000 });

    assert.equal(requests.length, 1, "must not keep running after a timeout");
    assert.equal(result.results[0].timedOut, true);
  });

  test("a syntax error in every test becomes a compilation error", async () => {
    respond = () => ({ body: { run: { stdout: "", stderr: 'File "solution.py", line 1\nSyntaxError: invalid syntax', code: 1 } } });
    const result = await judge.piston.run({ payload: payload([{ input: "a" }]), timeoutMs: 10_000 });
    assert.match(result.compileError, /SyntaxError/);
  });

  test("a runtime error is not mistaken for a compilation error", async () => {
    respond = () => ({ body: { run: { stdout: "", stderr: "ZeroDivisionError: division by zero", code: 1 } } });
    const result = await judge.piston.run({ payload: payload([{ input: "a" }]), timeoutMs: 10_000 });
    assert.equal(result.compileError, null);
    assert.equal(result.results[0].exitCode, 1);
  });

  test("an unreachable service is reported as unavailable, not as a wrong answer", async () => {
    const { httpJudgeProviders } = await import("../../src/services/execution/providers/httpJudgeProvider.js");
    const previous = process.env.PISTON_URL;
    try {
      respond = () => ({ status: 502, body: { message: "bad gateway" } });
      await assert.rejects(
        () => httpJudgeProviders.piston.run({ payload: payload([{ input: "a" }]), timeoutMs: 5000 }),
        /Code execution service returned 502/
      );
    } finally {
      process.env.PISTON_URL = previous;
    }
  });
});

describe("Judge0 adapter", () => {
  test("submits every test in one batch and maps time, memory and verdicts", async () => {
    requests = [];
    respond = (req, body) => ({
      body: body.submissions.map((submission, index) => ({
        stdout: `out-${index}\n`,
        stderr: null,
        time: "0.05",
        memory: 9000 + index,
        exit_code: 0,
        status: { id: 3, description: "Accepted" },
        token: `token-${index}`,
      })),
    });

    const result = await judge.judge0.run({ payload: payload([{ input: "a" }, { input: "b" }]), timeoutMs: 10_000 });

    assert.equal(requests.length, 1, "Judge0 supports batch submission");
    assert.match(requests[0].url, /\/judge0\/submissions\/batch\?.*wait=true/);
    assert.equal(requests[0].headers["x-auth-token"], "secret-token");
    assert.equal(requests[0].body.submissions.length, 2);
    assert.equal(requests[0].body.submissions[0].memory_limit, 256 * 1024);
    assert.deepEqual(result.results.map((r) => r.stdout), ["out-0\n", "out-1\n"]);
    assert.equal(result.results[0].timeMs, 50);
    assert.equal(result.results[0].memoryKb, 9000);
  });

  test("status 5 is a time limit and status 6 is a compilation error", async () => {
    respond = (req, body) => ({
      body: body.submissions.map((_, index) =>
        index === 0
          ? { status: { id: 5, description: "Time Limit Exceeded" }, time: "2.0", stdout: null }
          : { status: { id: 6 }, compile_output: "SyntaxError: bad", stdout: null }
      ),
    });

    const result = await judge.judge0.run({ payload: payload([{ input: "a" }, { input: "b" }]), timeoutMs: 10_000 });
    assert.equal(result.results[0].timedOut, true);
    assert.match(result.compileError, /SyntaxError/);
  });

  test("polls while submissions are still queued", async () => {
    requests = [];
    let polls = 0;
    respond = (req, body) => {
      if (req.method === "POST") return { body: [{ token: "t1", status: { id: 1 } }] };
      polls++;
      return {
        body: { submissions: [polls < 2 ? { token: "t1", status: { id: 2 } } : { token: "t1", status: { id: 3 }, stdout: "done\n", time: "0.01" }] },
      };
    };

    const result = await judge.judge0.run({ payload: payload([{ input: "a" }]), timeoutMs: 10_000 });
    assert.ok(polls >= 2, `expected polling, saw ${polls} poll(s)`);
    assert.equal(result.results[0].stdout, "done\n");
  });
});
