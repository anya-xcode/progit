// The shared access key used when DSAForge is deployed to the internet.
// APP_ACCESS_KEY has to be set before the config module is imported, so this
// file imports the harness dynamically.
import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

const KEY = "correct horse battery staple";
let server;

before(async () => {
  process.env.APP_ACCESS_KEY = KEY;
  const { startTestServer } = await import("../helpers/testServer.js");
  server = await startTestServer();
});

after(async () => {
  await server?.close();
  delete process.env.APP_ACCESS_KEY;
});

describe("with an access key configured", () => {
  test("requests without the key are refused", async () => {
    const { status, data } = await server.get("/problems");
    assert.equal(status, 401);
    assert.equal(data.code, "ACCESS_KEY_REQUIRED");
    assert.match(data.message, /access key/i);
  });

  test("a wrong key is refused", async () => {
    const { status } = await server.request("GET", "/problems", undefined, { headers: { "x-dsaforge-key": "nope" } });
    assert.equal(status, 401);
  });

  test("the right key is accepted", async () => {
    const { status, data } = await server.request("GET", "/problems", undefined, { headers: { "x-dsaforge-key": KEY } });
    assert.equal(status, 200);
    assert.equal(data.total, 474);
  });

  test("health stays open, and announces that a key is needed", async () => {
    const { status, data } = await server.get("/health");
    assert.equal(status, 200);
    assert.equal(data.accessKeyRequired, true);
  });

  test("the GitHub OAuth callback stays reachable (GitHub cannot send the header)", async () => {
    const { status } = await server.get("/github/oauth/callback?error=access_denied");
    assert.equal(status, 302, "must redirect rather than 401");
  });

  test("writing endpoints are protected too", async () => {
    const { status } = await server.post("/solutions", { problemId: "x", title: "t", code: "c" });
    assert.equal(status, 401);
  });
});
