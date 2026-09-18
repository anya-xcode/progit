import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// The A2Z sheet index: 18 steps → sub-steps → problems (title, difficulty, links).
// Regenerate with `node scripts/refresh-a2z-index.js`.
export const SHEET = JSON.parse(fs.readFileSync(path.join(DIR, "sheet.json"), "utf8"));

// Legacy slugs of DSAForge problems written before the sheet structure existed.
function readMapping() {
  try {
    const file = JSON.parse(fs.readFileSync(path.join(DIR, "mapping.json"), "utf8"));
    return file.mapping ?? {};
  } catch {
    return {};
  }
}
export const LEGACY_SLUG_TO_SHEET_ID = readMapping();

export const STEPS = SHEET.steps.map((step) => ({
  stepNo: step.stepNo,
  title: step.title,
  shortTitle: step.shortTitle,
  subSteps: step.subSteps.map((sub) => ({ subStepNo: sub.subStepNo, title: sub.title, count: sub.problems.length })),
  total: step.subSteps.reduce((sum, sub) => sum + sub.problems.length, 0),
}));

// sheetId → everything about that entry, including its position.
export const ENTRIES = new Map();
for (const step of SHEET.steps) {
  let orderInStep = 0;
  for (const sub of step.subSteps) {
    for (const problem of sub.problems) {
      ENTRIES.set(problem.sheetId, {
        ...problem,
        orderInStep: ++orderInStep,
        stepNo: step.stepNo,
        stepTitle: step.shortTitle,
        stepFullTitle: step.title,
        subStepNo: sub.subStepNo,
        subStepTitle: sub.title,
      });
    }
  }
}

export function sheetEntry(sheetId) {
  return ENTRIES.get(sheetId) ?? null;
}

export function bestPracticeLink(links = {}) {
  return links.leetcode || links.gfg || links.code360 || links.article || "";
}

export const STEP_NAMES = STEPS.map((step) => step.shortTitle);
