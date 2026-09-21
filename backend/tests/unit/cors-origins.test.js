// CLIENT_URL is typed by hand into a hosting dashboard, so it has to survive
// trailing slashes, spaces and several origins.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

async function loadEnv(clientUrl, tag) {
  const previous = process.env.CLIENT_URL;
  if (clientUrl === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = clientUrl;
  // Cache-busting query so each case re-reads process.env.
  const { env } = await import(`../../src/config/env.js?case=${tag}`);
  if (previous === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = previous;
  return env;
}

describe("allowed browser origins", () => {
  test("a trailing slash does not break the match", async () => {
    const env = await loadEnv("https://progit-frontend-blond.vercel.app/", "slash");
    assert.deepEqual(env.clientUrls, ["https://progit-frontend-blond.vercel.app"]);
  });

  test("several slashes and stray spaces are trimmed", async () => {
    const env = await loadEnv("  https://example.vercel.app///  ", "spaces");
    assert.deepEqual(env.clientUrls, ["https://example.vercel.app"]);
  });

  test("a comma-separated list allows more than one site", async () => {
    const env = await loadEnv("https://a.vercel.app/, https://b.vercel.app", "list");
    assert.deepEqual(env.clientUrls, ["https://a.vercel.app", "https://b.vercel.app"]);
    assert.equal(env.clientUrl, "https://a.vercel.app", "the first one is used for OAuth redirects");
  });

  test("local development is the default", async () => {
    const env = await loadEnv(undefined, "default");
    assert.deepEqual(env.clientUrls, ["http://localhost:5174"]);
  });
});
