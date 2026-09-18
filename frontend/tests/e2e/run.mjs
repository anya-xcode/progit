#!/usr/bin/env node
// DSAForge browser end-to-end tests.
//
// Starts its own Express backend and Vite dev server on free ports against a
// throwaway MongoDB database, drives the real Chrome through playwright-core,
// then tears everything down again. It never touches the development database
// (`dsaforge`) or the servers on 5050 / 5174.
//
//   cd frontend && npm run test:e2e
//
// Environment:
//   CHROME_PATH   path to the Chrome binary (default: the standard Windows one)
//   E2E_HEADED=1  show the browser
//   E2E_VERBOSE=1 stream the backend / Vite logs
//   E2E_MONGODB_URI  override the throwaway database URI
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReporter, watchConsole } from "./lib.mjs";
import { scenarios } from "./scenarios.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "../..");
const ROOT = path.resolve(FRONTEND, "..");
const BACKEND = path.join(ROOT, "backend");
const SCREENSHOTS = path.join(HERE, "screenshots");

const MONGO_URI = process.env.E2E_MONGODB_URI || "mongodb://127.0.0.1:27017/dsaforge_e2e";
const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : "/usr/bin/google-chrome");

// Never let the tests run against the development database.
const dbName = new URL(MONGO_URI.replace(/^mongodb(\+srv)?:/, "http:")).pathname.replace("/", "");
if (!dbName || !/e2e|test/i.test(dbName)) {
  console.error(`Refusing to run: "${dbName}" does not look like a throwaway database (expected a name containing "e2e").`);
  process.exit(1);
}

const require = createRequire(path.join(BACKEND, "package.json"));
const mongoose = require("mongoose");

// --------------------------------------------------------------- utilities

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, check, { timeout = 120_000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out after ${timeout} ms waiting for ${label}${lastError ? ` (last error: ${lastError.message})` : ""}`);
}

function startProcess(name, command, args, { cwd, env }) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const log = [];
  const collect = (stream) =>
    stream.on("data", (chunk) => {
      const text = chunk.toString();
      log.push(text);
      if (log.length > 200) log.shift();
      if (process.env.E2E_VERBOSE) process.stdout.write(`    [${name}] ${text}`);
    });
  collect(child.stdout);
  collect(child.stderr);
  child.on("error", (error) => log.push(`spawn error: ${error.message}\n`));
  return { name, child, log: () => log.join("") };
}

async function stopProcess(server) {
  if (!server?.child || server.child.exitCode !== null || server.child.signalCode) return;
  const exited = new Promise((resolve) => server.child.once("exit", resolve));
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.child.kill("SIGTERM");
  }
  await Promise.race([exited, sleep(5000)]);
}

async function dropDatabase() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  if (mongoose.connection.name !== dbName) throw new Error(`Connected to "${mongoose.connection.name}", expected "${dbName}"`);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
}

// ------------------------------------------------------------------- main

async function main() {
  const startedAt = Date.now();
  let backend = null;
  let vite = null;
  let browser = null;
  let reporter = null;
  let page = null;

  console.log("DSAForge end-to-end tests\n");

  try {
    await fs.rm(SCREENSHOTS, { recursive: true, force: true });
    await fs.mkdir(SCREENSHOTS, { recursive: true });

    console.log(`  database   ${MONGO_URI} (dropped before and after the run)`);
    await dropDatabase();

    // --- backend ---------------------------------------------------------
    const apiPort = await freePort();
    const clientPort = await freePort();
    const baseUrl = `http://localhost:${clientPort}`;
    const apiUrl = `http://127.0.0.1:${apiPort}`;

    // A deliberately clean environment: backend/.env is not loaded, so no
    // GitHub token leaks in and EXECUTION_PROVIDER keeps its default.
    const backendEnv = {
      ...process.env,
      PORT: String(apiPort),
      MONGODB_URI: MONGO_URI,
      CLIENT_URL: baseUrl,
      GITHUB_TOKEN: "",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
    };
    delete backendEnv.EXECUTION_PROVIDER;

    backend = startProcess("api", process.execPath, [path.join("src", "server.js")], { cwd: BACKEND, env: backendEnv });
    console.log(`  backend    ${apiUrl} (starting, syncing the problem library…)`);
    await waitFor(
      `the backend on ${apiPort}`,
      async () => {
        if (backend.child.exitCode !== null) throw new Error(`the backend exited with code ${backend.child.exitCode}`);
        const response = await fetch(`${apiUrl}/api/health`);
        const body = await response.json();
        return response.ok && body.status === "ok" && body.database === "connected";
      },
      { timeout: 180_000 }
    );

    // --- vite ------------------------------------------------------------
    vite = startProcess("web", process.execPath, [path.join("node_modules", "vite", "bin", "vite.js")], {
      cwd: FRONTEND,
      env: { ...process.env, PORT: String(clientPort), API_PORT: String(apiPort) },
    });
    console.log(`  frontend   ${baseUrl} (vite dev server)`);
    await waitFor(
      `the Vite dev server on ${clientPort}`,
      async () => {
        if (vite.child.exitCode !== null) throw new Error(`vite exited with code ${vite.child.exitCode}`);
        const response = await fetch(`${baseUrl}/`);
        return response.ok && (await response.text()).includes('id="root"');
      },
      { timeout: 120_000 }
    );

    // --- browser ---------------------------------------------------------
    await fs.access(CHROME).catch(() => {
      throw new Error(`Chrome not found at "${CHROME}". Set CHROME_PATH to your Chrome binary.`);
    });
    browser = await chromium.launch({ executablePath: CHROME, headless: !process.env.E2E_HEADED });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    context.setDefaultTimeout(20_000);
    page = await context.newPage();
    console.log(`  browser    ${CHROME}${process.env.E2E_HEADED ? "" : " (headless)"}\n`);

    // --- run -------------------------------------------------------------
    const consoleErrors = [];
    reporter = createReporter({ screenshotDir: SCREENSHOTS, page: () => page });
    watchConsole(page, consoleErrors, reporter.currentStep);

    const api = async (route, { allowError = false } = {}) => {
      const response = await fetch(`${apiUrl}/api${route.startsWith("/") ? route : `/${route}`}`);
      const body = await response.json().catch(() => null);
      if (allowError) return { status: response.status, body };
      if (!response.ok) throw new Error(`GET /api${route} failed with ${response.status}: ${body?.message ?? ""}`);
      return body;
    };

    const ctx = { page, context, baseUrl, apiUrl, api, consoleErrors, state: {} };
    for (const scenario of scenarios) {
      await reporter.step(scenario.name, () => scenario.fn(ctx));
    }
  } catch (error) {
    console.error(`\n  Setup failed: ${error.message}`);
    if (backend) console.error(`\n--- backend log ---\n${backend.log()}`);
    if (vite) console.error(`\n--- vite log ---\n${vite.log()}`);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    await stopProcess(vite);
    await stopProcess(backend);
    await dropDatabase().catch((error) => console.error(`  Could not drop ${MONGO_URI}: ${error.message}`));
    await mongoose.disconnect().catch(() => {});
  }

  // --- report ------------------------------------------------------------
  const results = reporter?.results ?? [];
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");

  console.log("\n  " + "-".repeat(70));
  console.log(
    `  ${passed} passed, ${failed.length} failed, ${skipped.length} skipped  (${results.length} scenarios)  in ${formatDuration(
      Date.now() - startedAt
    )}`
  );
  if (failed.length > 0) {
    console.log("\n  Failures:");
    for (const result of failed) {
      console.log(`    ${result.id}  ${result.name}`);
      console.log(
        String(result.error?.message ?? result.error)
          .split("\n")
          .map((line) => `      ${line}`)
          .join("\n")
      );
      if (result.screenshot) console.log(`      screenshot: ${result.screenshot}`);
    }
  }
  console.log("");

  if (failed.length > 0 || results.length === 0) process.exitCode = 1;
}

await main();
