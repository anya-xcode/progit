import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { ENTRIES, SHEET } from "../../src/data/a2z/index.js";
import { buildPlaceholders, loadLibrary, loadProblems } from "../../src/data/loadProblems.js";
import { DIFFICULTIES, SECTIONS } from "../../src/data/sections.js";

const library = loadLibrary();
const written = loadProblems({ includeReference: true });

describe("the A2Z sheet index", () => {
  test("has 18 steps and 474 entries", () => {
    assert.equal(SHEET.steps.length, 18);
    assert.equal(ENTRIES.size, 474);
    assert.equal(SECTIONS.length, 18);
  });

  test("every entry has an id, slug, title and valid difficulty", () => {
    for (const entry of ENTRIES.values()) {
      assert.ok(entry.sheetId && entry.slug && entry.title, `incomplete entry ${entry.sheetId}`);
      assert.ok(DIFFICULTIES.includes(entry.difficulty), `${entry.title} has difficulty ${entry.difficulty}`);
    }
  });

  test("slugs are unique across the sheet", () => {
    const slugs = new Set([...ENTRIES.values()].map((e) => e.slug));
    assert.equal(slugs.size, ENTRIES.size);
  });
});

describe("the library", () => {
  test("covers every sheet entry exactly once", () => {
    assert.equal(library.length, ENTRIES.size);
    assert.equal(new Set(library.map((p) => p.sheetId)).size, ENTRIES.size);
  });

  test("is ordered by step and position", () => {
    for (let i = 1; i < library.length; i++) {
      const previous = library[i - 1];
      const current = library[i];
      assert.ok(
        current.sectionOrder > previous.sectionOrder ||
          (current.sectionOrder === previous.sectionOrder && current.orderInSection >= previous.orderInSection),
        `out of order at ${current.title}`
      );
    }
  });

  test("step sizes match the sheet", () => {
    for (const section of SECTIONS) {
      const count = library.filter((p) => p.sectionOrder === section.order).length;
      assert.equal(count, section.total, `step ${section.order} (${section.name})`);
    }
  });

  test("placeholders are produced for missing content only", () => {
    const placeholders = buildPlaceholders(new Set(written.map((p) => p.sheetId)));
    assert.equal(placeholders.length, ENTRIES.size - written.length);
    for (const placeholder of placeholders) {
      assert.equal(placeholder.contentStatus, "placeholder");
      assert.equal(placeholder.testCases.length, 0);
    }
  });
});

describe("every written problem", () => {
  test("is solvable or a reference entry, and belongs to a sheet entry", () => {
    for (const problem of written) {
      assert.ok(["ready", "reference"].includes(problem.contentStatus), problem.slug);
      assert.ok(ENTRIES.has(problem.sheetId), `${problem.slug} has an unknown sheetId`);
    }
  });

  test("solvable problems have tests, examples and a starter", () => {
    for (const problem of written.filter((p) => p.contentStatus === "ready")) {
      assert.ok(problem.testCases.length >= 3, `${problem.slug}: ${problem.testCases.length} tests`);
      assert.ok(problem.testCases.some((t) => t.isHidden), `${problem.slug}: no hidden tests`);
      assert.ok(problem.testCases.some((t) => !t.isHidden), `${problem.slug}: no visible tests`);
      assert.ok(problem.examples.length >= 1, `${problem.slug}: no examples`);
      assert.ok(problem.starterCode.python.includes("# --- Input/output handling ---"), `${problem.slug}: no driver marker`);
      assert.ok(problem.statement.length > 40, `${problem.slug}: statement too short`);
    }
  });

  test("starter and reference share an identical driver", () => {
    const driver = (code) => code.slice(code.indexOf("# --- Input/output handling ---")).trim();
    for (const problem of written.filter((p) => p.contentStatus === "ready")) {
      assert.equal(driver(problem.starterCode.python), driver(problem.referenceSolution.python), `${problem.slug}: drivers differ`);
    }
  });

  test("reference solutions are not left unimplemented", () => {
    for (const problem of written.filter((p) => p.contentStatus === "ready")) {
      const body = problem.referenceSolution.python.split("# --- Input/output handling ---")[0];
      assert.ok(!/\bpass\s*$/.test(body.trim()), `${problem.slug}: reference body ends in pass`);
    }
  });
});
