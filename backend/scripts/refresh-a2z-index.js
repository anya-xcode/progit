// Rebuilds src/data/a2z/sheet.json — the index of the A2Z sheet: 18 steps,
// their sub-steps, and each problem's title, difficulty and practice links.
//
//   node scripts/refresh-a2z-index.js [path-or-url]
//
// Source: the MIT-licensed community sheet at
// https://github.com/anishmusician/striver-a2z-sheet (src/data/a2z-sheet.json).
// Only the structure is taken — titles, difficulty and links. Problem
// statements, editorials and starter code in DSAForge are written from scratch
// (see docs/PROBLEM_FORMAT.md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHORT_STEP_TITLES } from "../src/data/a2z/steps.js";

const DEFAULT_SOURCE = "https://raw.githubusercontent.com/anishmusician/striver-a2z-sheet/main/src/data/a2z-sheet.json";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/a2z/sheet.json");

const source = process.argv[2] ?? DEFAULT_SOURCE;
const raw = /^https?:\/\//.test(source)
  ? await (await fetch(source)).json()
  : JSON.parse(fs.readFileSync(source, "utf8"));

// The upstream index has a couple of wrong rows; their position and their own
// links give away what they should be. Fixed here so regenerating keeps them.
const OVERRIDES = {
  // Sits between "Count partitions with given difference" (DP-18) and
  // "Minimum Coins (DP-20)", but repeats Assign Cookies from step 12.
  "prob-16-4-6-assign-cookies": {
    title: "0/1 Knapsack (DP-19)",
    links: {
      leetcode: "",
      gfg: "https://www.geeksforgeeks.org/problems/0-1-knapsack-problem0945/1",
      code360: "https://www.naukri.com/code360/problems/0-1-knapsack_920542",
      article: "https://takeuforward.org/data-structure/0-1-knapsack-dp-19/",
      youtube: "",
    },
  },
  // Titled "Minimum Falling Path Sum" but its LeetCode link and DP-10 position
  // are the grid minimum path sum.
  "prob-16-3-4-minimum-falling-path-sum": { title: "Minimum Path Sum in a Grid (DP-10)" },
};

const slugOf = (title) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const seen = new Set();
const steps = raw.steps.map((step) => ({
  stepNo: step.stepNo,
  title: step.title,
  shortTitle: SHORT_STEP_TITLES[step.stepNo] ?? step.title,
  subSteps: step.subcategories.map((sub) => ({
    subStepNo: sub.subStepNo,
    title: sub.title,
    problems: sub.problems.map((raw, index) => {
      const problem = { ...raw, ...OVERRIDES[raw.id], links: { ...raw.links } };
      let slug = slugOf(problem.title);
      for (let n = 2; seen.has(slug); n++) slug = `${slugOf(problem.title)}-${n}`;
      seen.add(slug);
      return {
        sheetId: problem.id,
        slug,
        title: problem.title,
        difficulty: problem.difficulty,
        order: index + 1,
        links: OVERRIDES[raw.id]?.links ?? {
          leetcode: problem.leetcode ?? "",
          gfg: problem.gfg ?? "",
          code360: problem.code360 ?? "",
          article: problem.article ?? "",
          youtube: problem.youtube ?? "",
        },
      };
    }),
  })),
}));

const totalProblems = steps.reduce((sum, step) => sum + step.subSteps.reduce((n, sub) => n + sub.problems.length, 0), 0);
const index = {
  note: "Structure of Striver's A2Z DSA sheet (steps, sub-steps, titles, difficulty, practice links). Problem statements in DSAForge are original.",
  source: "https://github.com/anishmusician/striver-a2z-sheet (MIT)",
  totalSteps: steps.length,
  totalProblems,
  steps,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(index, null, 1)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${steps.length} steps, ${totalProblems} problems`);
