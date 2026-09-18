import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import { load as parseYaml } from "js-yaml";
import { ENTRIES, LEGACY_SLUG_TO_SHEET_ID } from "../../src/data/a2z/index.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/data");
const mapping = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "a2z/mapping.json"), "utf8"));

// Raw YAML slugs, before the sheet renames them.
const rawSlugs = new Set();
for (const file of fs.readdirSync(path.join(DATA_DIR, "problems")).filter((f) => f.endsWith(".yaml"))) {
  const doc = parseYaml(fs.readFileSync(path.join(DATA_DIR, "problems", file), "utf8"));
  for (const problem of doc.problems ?? []) rawSlugs.add(problem.slug);
}

describe("legacy slug → sheet mapping", () => {
  test("every mapped slug still exists in the problem files", () => {
    for (const slug of Object.keys(mapping.mapping)) {
      assert.ok(rawSlugs.has(slug), `mapping points at "${slug}", which no problem file defines`);
    }
  });

  test("every mapped sheet id is real", () => {
    for (const [slug, sheetId] of Object.entries(mapping.mapping)) {
      assert.ok(ENTRIES.has(sheetId), `"${slug}" maps to unknown sheet entry "${sheetId}"`);
    }
  });

  test("no two problems claim the same sheet entry", () => {
    const seen = new Map();
    for (const [slug, sheetId] of Object.entries(mapping.mapping)) {
      assert.equal(seen.get(sheetId), undefined, `"${slug}" and "${seen.get(sheetId)}" both map to ${sheetId}`);
      seen.set(sheetId, slug);
    }
  });

  test("problems removed as off-sheet are really gone", () => {
    for (const entry of mapping.unmapped ?? []) {
      assert.ok(!rawSlugs.has(entry.slug), `"${entry.slug}" is listed as unmapped but still has content`);
    }
  });
});

describe("problem files", () => {
  test("every problem resolves to a sheet entry (no orphans)", () => {
    const orphans = [];
    for (const file of fs.readdirSync(path.join(DATA_DIR, "problems")).filter((f) => f.endsWith(".yaml"))) {
      const doc = parseYaml(fs.readFileSync(path.join(DATA_DIR, "problems", file), "utf8"));
      for (const problem of doc.problems ?? []) {
        const sheetId = problem.sheetId || LEGACY_SLUG_TO_SHEET_ID[problem.slug];
        if (!sheetId || !ENTRIES.has(sheetId)) orphans.push(`${file}: ${problem.slug}`);
      }
    }
    assert.deepEqual(orphans, [], "these problems would be skipped at load time");
  });

  test("a problem's declared difficulty matches the sheet exactly", () => {
    const mismatches = [];
    for (const file of fs.readdirSync(path.join(DATA_DIR, "problems")).filter((f) => f.endsWith(".yaml"))) {
      const doc = parseYaml(fs.readFileSync(path.join(DATA_DIR, "problems", file), "utf8"));
      for (const problem of doc.problems ?? []) {
        const entry = ENTRIES.get(problem.sheetId || LEGACY_SLUG_TO_SHEET_ID[problem.slug]);
        if (entry && problem.difficulty !== entry.difficulty) {
          mismatches.push(`${problem.slug}: file says ${problem.difficulty}, sheet says ${entry.difficulty}`);
        }
      }
    }
    // The sheet wins at load time, but the files should not disagree with it.
    assert.deepEqual(mismatches, []);
  });
});
