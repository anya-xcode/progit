// Runs every DSAForge test suite and prints one summary.
//
//   node scripts/run-all-tests.mjs            # everything
//   node scripts/run-all-tests.mjs --fast     # skip the slow sandbox sweeps
//
// Needs MongoDB running locally. Nothing here touches the development
// database (`dsaforge`) — every suite uses its own throwaway database.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Run npm through its own CLI with the current node: no shell, so paths with
// spaces ("C:\Program Files\nodejs") and a missing PATH entry cannot bite.
const NPM_CLI = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const useNodeCli = fs.existsSync(NPM_CLI);
const fast = process.argv.includes("--fast");

const SUITES = [
  { name: "Unit (judge, library, GitHub files, mapping)", cwd: "backend", script: "test:unit" },
  { name: "API integration (every endpoint)", cwd: "backend", script: "test:api" },
  { name: "Problem data + reference solutions", cwd: "backend", script: "verify:problems" },
  { name: "Sandbox isolation and limits", cwd: "backend", script: "test:sandbox" },
  { name: "GitHub sync (mock GitHub API)", cwd: "backend", script: "test:github" },
  { name: "Browser end-to-end", cwd: "frontend", script: "test:e2e" },
  { name: "Reference solutions in the real sandbox", cwd: "backend", script: "verify:problems", args: ["--", "--sandbox"], slow: true },
];

function run({ cwd, script, args = [] }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = useNodeCli
      ? spawn(process.execPath, [NPM_CLI, "run", script, ...args], {
          cwd: path.join(ROOT, cwd),
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("npm", ["run", script, ...args], {
          cwd: path.join(ROOT, cwd),
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output, seconds: ((Date.now() - started) / 1000).toFixed(1) }));
  });
}

// Pull the most informative line out of each suite's output.
function summarize(output) {
  const patterns = [
    /# pass \d+[\s\S]*?# fail \d+/,
    /\d+\/\d+ problems passed\./,
    /\d+ passed, \d+ failed(, \d+ skipped)?/,
    /All sandbox checks passed\./,
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) return match[0].replace(/\s*#\s*/g, " ").replace(/\s+/g, " ").trim();
  }
  return "(see output above)";
}

const results = [];
for (const suite of SUITES) {
  if (fast && suite.slow) {
    results.push({ ...suite, skipped: true });
    console.log(`\n── SKIPPED (--fast): ${suite.name}`);
    continue;
  }
  console.log(`\n── ${suite.name} …`);
  const result = await run(suite);
  const summary = summarize(result.output);
  console.log(`   ${result.code === 0 ? "PASS" : "FAIL"}  ${summary}  (${result.seconds}s)`);
  if (result.code !== 0) console.log(result.output.split("\n").slice(-40).join("\n"));
  results.push({ ...suite, ...result, summary });
}

const failed = results.filter((r) => !r.skipped && r.code !== 0);
console.log(`\n${"=".repeat(72)}\nDSAForge test summary\n${"=".repeat(72)}`);
for (const result of results) {
  const status = result.skipped ? "SKIP" : result.code === 0 ? "PASS" : "FAIL";
  console.log(`${status}  ${result.name.padEnd(46)} ${result.skipped ? "" : `${result.summary} (${result.seconds}s)`}`);
}
console.log(failed.length === 0 ? "\nEverything passed." : `\n${failed.length} suite(s) failed.`);
process.exit(failed.length === 0 ? 0 : 1);
