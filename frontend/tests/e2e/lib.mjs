// Small helpers shared by the end-to-end scenarios: assertions, the `step`
// runner that records pass/fail and keeps going, console-error collection and
// a few Monaco / problem-list utilities.
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------- assertions

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

export class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "SkipError";
  }
}

export function skip(reason) {
  throw new SkipError(reason);
}

function show(value) {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(`${label}\n      expected: ${show(expected)}\n      actual:   ${show(actual)}`);
  }
}

export function assertIncludes(haystack, needle, label) {
  if (!String(haystack).includes(needle)) {
    throw new AssertionError(`${label}\n      expected to contain: ${show(needle)}\n      actual:              ${show(truncate(haystack))}`);
  }
}

export function assertExcludes(haystack, needle, label) {
  if (String(haystack).includes(needle)) {
    throw new AssertionError(`${label}\n      expected NOT to contain: ${show(needle)}\n      actual:                  ${show(truncate(haystack))}`);
  }
}

export function assertMatches(value, pattern, label) {
  if (!pattern.test(String(value))) {
    throw new AssertionError(`${label}\n      expected to match: ${pattern}\n      actual:            ${show(truncate(value))}`);
  }
}

function truncate(value, max = 400) {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ------------------------------------------------------------------ reporter

const ICONS = { pass: "PASS", fail: "FAIL", skip: "SKIP" };

export function createReporter({ screenshotDir, page }) {
  const results = [];
  let index = 0;
  let current = null;

  async function screenshot(name) {
    if (!page()) return null;
    const file = path.join(screenshotDir, `${String(index).padStart(2, "0")}-${slug(name)}.png`);
    try {
      await fs.mkdir(screenshotDir, { recursive: true });
      await page().screenshot({ path: file, fullPage: true });
      return file;
    } catch {
      return null;
    }
  }

  async function step(name, fn) {
    index += 1;
    const id = String(index).padStart(2, "0");
    current = name;
    const started = Date.now();
    let outcome;
    try {
      await fn();
      outcome = { id, name, status: "pass", ms: Date.now() - started };
    } catch (error) {
      if (error instanceof SkipError) {
        outcome = { id, name, status: "skip", ms: Date.now() - started, reason: error.message };
      } else {
        outcome = {
          id,
          name,
          status: "fail",
          ms: Date.now() - started,
          error,
          screenshot: await screenshot(name),
        };
      }
    } finally {
      current = null;
    }

    results.push(outcome);
    const seconds = `${(outcome.ms / 1000).toFixed(1)}s`;
    console.log(`  ${ICONS[outcome.status]}  ${id}  ${name}  (${seconds})`);
    if (outcome.status === "skip") console.log(`        skipped: ${outcome.reason}`);
    if (outcome.status === "fail") {
      console.log(indent(outcome.error?.stack && !(outcome.error instanceof AssertionError) ? outcome.error.stack : outcome.error?.message));
      if (outcome.screenshot) console.log(`        screenshot: ${outcome.screenshot}`);
    }
    return outcome.status;
  }

  return { step, results, currentStep: () => current };
}

function indent(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => `        ${line}`)
    .join("\n");
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

// ------------------------------------------------------- console / page errors

// Noise that is not an application bug: responses the UI handles itself
// (404 for an unknown slug, 409 for a duplicate approach name), the favicon,
// third-party avatars and the Vite dev client chatter.
const IGNORED = [
  /Failed to load resource/i,
  /favicon/i,
  /avatars\.githubusercontent\.com/i,
  /githubusercontent|gravatar|googleusercontent/i,
  /ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_REFUSED|BLOCKED_BY_CLIENT|ABORTED)/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
];

export function watchConsole(page, collected, currentStep) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    collected.push({ kind: "console", text, step: currentStep() ?? "(between scenarios)", url: page.url() });
  });
  page.on("pageerror", (error) => {
    const text = error?.stack || String(error);
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    collected.push({ kind: "pageerror", text, step: currentStep() ?? "(between scenarios)", url: page.url() });
  });
}

// ------------------------------------------------------------ page utilities

// Monaco renders only the lines inside the viewport; every solution used here
// is short enough to be rendered in full.
export function editorText(page, root = ".monaco-editor") {
  return page.evaluate((selector) => {
    const editor = document.querySelector(selector);
    if (!editor) return "";
    return [...editor.querySelectorAll(".view-line")]
      .map((line) => line.textContent)
      .join("\n")
      .replace(/ /g, " ");
  }, root);
}

// Monaco renders spaces as non-breaking spaces, so every check normalises them.
export async function waitForEditorText(page, needle, { root = ".monaco-editor", timeout = 20_000, label } = {}) {
  try {
    await page.waitForFunction(
      ({ selector, text }) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        return [...element.querySelectorAll(".view-line")]
          .map((line) => line.textContent)
          .join("\n")
          .replace(/ /g, " ")
          .includes(text);
      },
      { selector: root, text: needle },
      { timeout }
    );
  } catch {
    throw new AssertionError(
      `${label ?? "the editor never showed the expected code"}\n      expected the editor to contain: ${show(needle)}\n      actual editor contents:\n${await editorText(page, root)}`
    );
  }
}

// Typing into Monaco triggers auto-indent and destroys Python, so the code goes
// through the real clipboard and a Ctrl+V paste.
export async function pasteIntoEditor(page, code, { root = ".monaco-editor", marker } = {}) {
  const editor = page.locator(root).first();
  await editor.locator(".view-lines").first().waitFor({ state: "visible", timeout: 60_000 });

  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await editor.locator(".view-lines").first().click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");

  const needle = marker ?? code.split("\n").find((line) => line.trim());
  await waitForEditorText(page, needle, { root, timeout: 15_000, label: "pasting code into the editor did not take effect" });
}

// Problem rows in the library list (the "Add custom problem" link is not one).
export function problemRowHrefs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/problems/"]')]
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href) => !href.startsWith("/problems/new"))
  );
}

export async function waitForRowCount(page, expected, label) {
  try {
    await page.waitForFunction(
      (count) =>
        [...document.querySelectorAll('a[href^="/problems/"]')].filter((a) => !a.getAttribute("href").startsWith("/problems/new")).length ===
        count,
      expected,
      { timeout: 15_000 }
    );
  } catch {
    const actual = (await problemRowHrefs(page)).length;
    throw new AssertionError(`${label}\n      expected: ${expected} problem rows\n      actual:   ${actual} problem rows`);
  }
}

// Runs `action` and waits for the matching /api/problems response, so the list
// is never read while the previous result is still on screen.
export async function withProblemsResponse(page, match, action) {
  const response = page.waitForResponse(
    (res) => {
      if (!res.url().includes("/api/problems")) return false;
      try {
        return match(new URL(res.url()).searchParams, res);
      } catch {
        return false;
      }
    },
    { timeout: 30_000 }
  );
  await action();
  await response;
}

// The 18 step headers of the library, with their "solved / total" counters.
export function stepHeaders(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("section > button[aria-expanded]")].map((button) => ({
      title: (button.querySelector("span.font-semibold")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      counts: (button.querySelector("span.w-16")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      expanded: button.getAttribute("aria-expanded") === "true",
    }))
  );
}

export function statCard(page, label) {
  return page.evaluate((text) => {
    const heading = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === text);
    const card = heading?.parentElement?.parentElement;
    return {
      value: card?.querySelector("p.text-2xl")?.textContent.trim() ?? null,
      detail: card?.querySelector("p.text-xs")?.textContent.trim() ?? null,
    };
  }, label);
}
