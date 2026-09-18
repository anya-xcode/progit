// Lists A2Z sheet entries that have no written problem yet.
//
//   node scripts/list-missing.js              # counts per step
//   node scripts/list-missing.js --step 5     # every missing entry of step 5
//   node scripts/list-missing.js --step 5 --json
import { ENTRIES } from "../src/data/a2z/index.js";
import { loadProblems } from "../src/data/loadProblems.js";

const stepArg = process.argv.indexOf("--step");
const step = stepArg === -1 ? null : Number(process.argv[stepArg + 1]);
const asJson = process.argv.includes("--json");

const written = new Set(loadProblems().map((problem) => problem.sheetId));
const missing = [...ENTRIES.values()].filter((entry) => !written.has(entry.sheetId));

if (step === null) {
  const perStep = new Map();
  for (const entry of missing) {
    const key = `${String(entry.stepNo).padStart(2)}. ${entry.stepTitle}`;
    perStep.set(key, (perStep.get(key) ?? 0) + 1);
  }
  console.log(`${missing.length} of ${ENTRIES.size} sheet problems still need content\n`);
  for (const [key, count] of [...perStep.entries()].sort()) console.log(`${key.padEnd(40)} ${count}`);
  process.exit(0);
}

const forStep = missing.filter((entry) => entry.stepNo === step);
if (asJson) {
  console.log(JSON.stringify(forStep, null, 1));
  process.exit(0);
}

console.log(`Step ${step} — ${forStep.length} problems to write\n`);
let currentSub = "";
for (const entry of forStep) {
  if (entry.subStepTitle !== currentSub) {
    currentSub = entry.subStepTitle;
    console.log(`\n## ${entry.subStepNo}. ${currentSub}`);
  }
  const links = Object.entries(entry.links)
    .filter(([, url]) => url)
    .map(([name, url]) => `${name}: ${url}`)
    .join("  ");
  console.log(`- ${entry.sheetId}\n    title: ${entry.title}\n    difficulty: ${entry.difficulty}\n    links: ${links || "(none)"}`);
}
