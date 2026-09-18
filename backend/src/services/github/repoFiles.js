// Builds the paths and file contents written to the GitHub repository.
//
//   <basePath>/README.md
//   <basePath>/03-Arrays/Two-Sum/problem.md
//   <basePath>/03-Arrays/Two-Sum/test_cases.txt
//   <basePath>/03-Arrays/Two-Sum/README.md
//   <basePath>/03-Arrays/Two-Sum/hash-map.py          (one file per approach)
import { LANGUAGES } from "../../config/languages.js";
import { VERDICTS } from "../judge/verdicts.js";

const COMMENT_PREFIX = { python: "#", javascript: "//", cpp: "//", java: "//" };

function toFolderName(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "Untitled";
}

export function joinPath(...parts) {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/|\/$/g, "");
}

export function sectionFolder(problem) {
  return `${String(problem.sectionOrder ?? 99).padStart(2, "0")}-${toFolderName(problem.section)}`;
}

export function problemFolder(problem, basePath = "") {
  return joinPath(basePath, sectionFolder(problem), toFolderName(problem.title));
}

export function solutionFileName(solution) {
  const extension = LANGUAGES[solution.language]?.extension ?? "txt";
  return `${solution.slug}.${extension}`;
}

export function solutionPath(problem, solution, basePath = "") {
  return joinPath(problemFolder(problem, basePath), solutionFileName(solution));
}

// Relative path from the base folder, for links inside README files.
function relativeToBase(problem, file = "") {
  return joinPath(sectionFolder(problem), toFolderName(problem.title), file);
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = (text) => (text ? `\`${cell(text)}\`` : "—");

function fence(text) {
  const body = String(text ?? "").replace(/\s+$/, "");
  const ticks = body.includes("```") ? "````" : "```";
  return `${ticks}text\n${body}\n${ticks}`;
}

function verdictLabel(solution) {
  if (solution.verdict === VERDICTS.ACCEPTED) return "✅ Accepted";
  return solution.verdict || "Not Submitted";
}

function formatStats(solution) {
  const parts = [];
  if (solution.runtime !== null && solution.runtime !== undefined) parts.push(`${Math.round(solution.runtime)} ms`);
  if (solution.memory) parts.push(`${(solution.memory / 1024).toFixed(1)} MB`);
  return parts.join(", ");
}

export function renderProblemMd(problem) {
  const lines = [`# ${problem.title}`, ""];
  lines.push("| | |", "|---|---|");
  lines.push(`| **Striver section** | ${cell(problem.section)}${problem.subtopic ? ` — ${cell(problem.subtopic)}` : ""} |`);
  lines.push(`| **Topic** | ${cell(problem.topic)} |`);
  lines.push(`| **Difficulty** | ${cell(problem.difficulty)} |`);
  if (problem.tags?.length) lines.push(`| **Tags** | ${problem.tags.map((tag) => cell(tag)).join(", ")} |`);
  if (problem.sourceUrl) lines.push(`| **Source** | [${cell(problem.sourceUrl)}](${problem.sourceUrl}) |`);
  lines.push("", "## Problem Statement", "", problem.statement.trim(), "");

  if (problem.inputFormat) lines.push("## Input Format", "", problem.inputFormat.trim(), "");
  if (problem.outputFormat) lines.push("## Output Format", "", problem.outputFormat.trim(), "");
  if (problem.constraints?.length) {
    lines.push("## Constraints", "", ...problem.constraints.map((c) => `- \`${c}\``), "");
  }

  if (problem.examples?.length) {
    lines.push("## Examples", "");
    problem.examples.forEach((example, index) => {
      lines.push(`### Example ${index + 1}`, "", "**Input**", "", fence(example.input), "", "**Output**", "", fence(example.output), "");
      if (example.explanation) lines.push(`**Explanation:** ${example.explanation}`, "");
    });
  }

  const visible = problem.testCases.filter((test) => !test.isHidden);
  if (visible.length) {
    lines.push("## Test Cases", "");
    visible.forEach((test, index) => {
      lines.push(`### Test Case ${index + 1}`, "", "**Input**", "", fence(test.input), "", "**Expected Output**", "", fence(test.expectedOutput), "");
    });
  }
  const hiddenCount = problem.testCases.length - visible.length;
  lines.push(`All ${problem.testCases.length} test cases${hiddenCount ? ` (including ${hiddenCount} hidden)` : ""} are in [test_cases.txt](test_cases.txt).`, "");

  return `${lines.join("\n").trim()}\n`;
}

export function renderTestCases(problem) {
  const blocks = problem.testCases.map((test, index) =>
    [
      `=== Test Case ${index + 1}${test.isHidden ? " (hidden)" : ""} ===`,
      "--- input ---",
      String(test.input).replace(/\s+$/, ""),
      "--- expected output ---",
      String(test.expectedOutput).replace(/\s+$/, ""),
    ].join("\n")
  );
  return `# ${problem.title} — ${problem.testCases.length} test cases (stdin → expected stdout)\n\n${blocks.join("\n\n")}\n`;
}

export function renderSolutionFile(problem, solution) {
  const c = COMMENT_PREFIX[solution.language] ?? "#";
  const header = [
    `${c} Problem: ${problem.title}`,
    `${c} Approach: ${solution.title}${solution.approach && solution.approach !== solution.title ? ` (${solution.approach})` : ""}`,
    `${c} Time Complexity: ${solution.timeComplexity || "not specified"}`,
    `${c} Space Complexity: ${solution.spaceComplexity || "not specified"}`,
  ];
  if (solution.explanation?.trim()) {
    header.push(`${c}`, `${c} Explanation:`, ...solution.explanation.trim().split(/\r?\n/).map((line) => `${c} ${line}`.trimEnd()));
  }
  return `${header.join("\n")}\n\n${solution.code.replace(/\r\n?/g, "\n").replace(/\s+$/, "")}\n`;
}

function summaryOf(statement) {
  const paragraph = String(statement).trim().split(/\n\s*\n/)[0] ?? "";
  return paragraph.replace(/\s*\n\s*/g, " ");
}

// `solutions`: every approach of this problem that is (or is being) on GitHub.
export function renderProblemReadme(problem, solutions) {
  const lines = [
    `# ${problem.title}`,
    "",
    `**${problem.section}** · ${problem.topic} · ${problem.difficulty}${problem.sourceUrl ? ` · [Source](${problem.sourceUrl})` : ""}`,
    "",
    summaryOf(problem.statement),
    "",
    "Full statement: [problem.md](problem.md) · Test cases: [test_cases.txt](test_cases.txt)",
    "",
    "## Approaches",
    "",
    "| # | Approach | Type | Time | Space | Status | Solution |",
    "|---|---|---|---|---|---|---|",
  ];
  solutions.forEach((solution, index) => {
    const file = solutionFileName(solution);
    const stats = formatStats(solution);
    lines.push(
      `| ${index + 1} | ${cell(solution.title)} | ${cell(solution.approach)} | ${code(solution.timeComplexity)} | ${code(solution.spaceComplexity)} | ${verdictLabel(solution)}${stats ? ` (${stats})` : ""} | [${file}](${file}) |`
    );
  });

  solutions.forEach((solution) => {
    lines.push("", `## ${solution.title}`, "");
    lines.push(`- **Time:** ${code(solution.timeComplexity)}`, `- **Space:** ${code(solution.spaceComplexity)}`);
    lines.push(`- **Code:** [${solutionFileName(solution)}](${solutionFileName(solution)})`);
    if (solution.explanation?.trim()) lines.push("", solution.explanation.trim());
  });

  return `${lines.join("\n")}\n`;
}

// `groups`: [{ problem, solutions }] for everything on GitHub, any order.
export function renderRootReadme(groups) {
  const sorted = [...groups].sort(
    (a, b) =>
      (a.problem.sectionOrder ?? 99) - (b.problem.sectionOrder ?? 99) ||
      (a.problem.orderInSection ?? 0) - (b.problem.orderInSection ?? 0) ||
      a.problem.title.localeCompare(b.problem.title)
  );
  const solutionCount = sorted.reduce((sum, group) => sum + group.solutions.length, 0);
  const accepted = sorted.filter((group) => group.solutions.some((s) => s.verdict === VERDICTS.ACCEPTED)).length;

  const lines = [
    "# DSA Solutions",
    "",
    "> Practice DSA. Build Your GitHub. — synced automatically from DSAForge.",
    "",
    `**${plural(sorted.length, "problem")} · ${plural(solutionCount, "solution")} · ${accepted} solved**`,
    "",
  ];

  const bySection = new Map();
  for (const group of sorted) {
    if (!bySection.has(group.problem.section)) bySection.set(group.problem.section, []);
    bySection.get(group.problem.section).push(group);
  }

  if (bySection.size > 0) {
    lines.push("## Progress by Section", "", "| Section | Problems | Solutions |", "|---|---|---|");
    for (const [section, items] of bySection) {
      const anchor = section.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
      lines.push(`| [${cell(section)}](#${anchor}) | ${items.length} | ${items.reduce((n, g) => n + g.solutions.length, 0)} |`);
    }
    lines.push("");
  }

  for (const [section, items] of bySection) {
    lines.push(`## ${section}`, "", "| Problem | Difficulty | Approaches | Complexity |", "|---|---|---|---|");
    for (const { problem, solutions } of items) {
      const approaches = solutions
        .map((s) => `[${cell(s.title)}](${encodeURI(relativeToBase(problem, solutionFileName(s)))})`)
        .join(" · ");
      const complexity = solutions.map((s) => code(s.timeComplexity)).join(" · ");
      lines.push(`| [${cell(problem.title)}](${encodeURI(relativeToBase(problem, "README.md"))}) | ${problem.difficulty} | ${approaches} | ${complexity} |`);
    }
    lines.push("");
  }

  if (sorted.length === 0) lines.push("No solutions synced yet.", "");
  return `${lines.join("\n").trim()}\n`;
}
