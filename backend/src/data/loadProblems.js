import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { bestPracticeLink, ENTRIES, LEGACY_SLUG_TO_SHEET_ID, sheetEntry } from "./a2z/index.js";
import { DIFFICULTIES } from "./sections.js";

const PROBLEMS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "problems");
export const DRIVER_MARKER = "# --- Input/output handling ---";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function asText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function validate(problem, where) {
  const errors = [];
  const requireText = (field) => {
    if (typeof problem[field] !== "string" || problem[field].trim() === "") {
      errors.push(`"${field}" is required`);
    }
  };

  // Reference entries (theory items on the sheet, e.g. "STL", "Theory with
  // examples") are read and ticked off instead of solved, so they only need
  // an explainer.
  if (problem.type === "reference") {
    ["slug", "title", "difficulty", "topic", "statement"].forEach(requireText);
    if (errors.length > 0) throw new Error(`${where}:\n  - ${errors.join("\n  - ")}`);
    return;
  }

  ["slug", "title", "difficulty", "topic", "statement", "inputFormat", "outputFormat", "explanation"].forEach(requireText);

  if (problem.slug && !SLUG_PATTERN.test(problem.slug)) errors.push(`slug "${problem.slug}" must be kebab-case`);
  if (problem.difficulty && !DIFFICULTIES.includes(problem.difficulty)) {
    errors.push(`difficulty must be one of ${DIFFICULTIES.join(", ")}`);
  }
  if (!Array.isArray(problem.constraints) || problem.constraints.length === 0) errors.push(`"constraints" must be a non-empty list`);
  if (!Array.isArray(problem.examples) || problem.examples.length === 0) errors.push(`"examples" must be a non-empty list`);
  if (!Array.isArray(problem.hints) || problem.hints.length === 0) errors.push(`"hints" must be a non-empty list`);
  if (!Array.isArray(problem.testCases) || problem.testCases.length < 3) errors.push(`"testCases" needs at least 3 cases`);
  if (Array.isArray(problem.testCases) && !problem.testCases.some((t) => t.hidden === true)) {
    errors.push(`at least one test case must have "hidden: true"`);
  }
  if (Array.isArray(problem.testCases) && !problem.testCases.some((t) => t.hidden !== true)) {
    errors.push(`at least one test case must be visible ("hidden: false")`);
  }

  const starter = problem.starterCode?.python;
  const reference = problem.referenceSolution?.python;
  if (typeof starter !== "string") errors.push(`"starterCode.python" is required`);
  if (typeof reference !== "string") errors.push(`"referenceSolution.python" is required`);
  if (typeof starter === "string" && typeof reference === "string") {
    const driverOf = (code) => {
      const index = code.indexOf(DRIVER_MARKER);
      return index === -1 ? null : code.slice(index).replace(/\r\n?/g, "\n").trim();
    };
    if (driverOf(starter) === null) errors.push(`starter code must contain the line "${DRIVER_MARKER}"`);
    else if (driverOf(starter) !== driverOf(reference)) {
      errors.push(`everything after "${DRIVER_MARKER}" must be identical in starterCode and referenceSolution`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`${where}:\n  - ${errors.join("\n  - ")}`);
  }
}

// Reads every problems/*.yaml file and returns problems placed in the A2Z
// sheet (step, sub-step, order). Each problem must belong to a sheet entry,
// either through its own `sheetId` or through a2z/mapping.json.
// Pass { includeReference: true } to keep reference solutions (checker only).
export function loadProblems({ includeReference = false } = {}) {
  const files = fs
    .readdirSync(PROBLEMS_DIR)
    .filter((file) => file.endsWith(".yaml"))
    .sort();

  const problems = [];
  const seenSlugs = new Map();
  const seenSheetIds = new Map();
  const offSheet = [];

  for (const file of files) {
    const doc = parseYaml(fs.readFileSync(path.join(PROBLEMS_DIR, file), "utf8"));
    if (!Array.isArray(doc?.problems)) throw new Error(`${file}: "problems" must be a list`);

    doc.problems.forEach((raw, index) => {
      const where = `${file} → problem #${index + 1} (${raw?.slug ?? "no slug"})`;
      validate(raw, where);
      if (seenSlugs.has(raw.slug)) throw new Error(`${where}: duplicate slug, also in ${seenSlugs.get(raw.slug)}`);
      seenSlugs.set(raw.slug, file);

      const sheetId = asText(raw.sheetId).trim() || LEGACY_SLUG_TO_SHEET_ID[raw.slug] || "";
      const entry = sheetEntry(sheetId);
      if (!entry) {
        offSheet.push({ file, slug: raw.slug, title: raw.title });
        return;
      }
      if (seenSheetIds.has(sheetId)) {
        throw new Error(`${where}: sheet entry "${sheetId}" is already used by ${seenSheetIds.get(sheetId)}`);
      }
      seenSheetIds.set(sheetId, raw.slug);

      const problem = {
        sheetId,
        // The sheet's slug is the URL, so a problem keeps its address when its
        // content is written later (placeholder → full problem).
        slug: entry.slug,
        title: raw.title.trim(),
        section: entry.stepTitle,
        sectionOrder: entry.stepNo,
        sectionFullTitle: entry.stepFullTitle,
        orderInSection: entry.orderInStep,
        subStepNo: entry.subStepNo,
        subtopic: entry.subStepTitle,
        practiceLinks: entry.links,
        contentStatus: raw.type === "reference" ? "reference" : "ready",
        topic: raw.topic.trim(),
        difficulty: entry.difficulty,
        tags: (raw.tags ?? []).map(String),
        statement: raw.statement.trim(),
        inputFormat: asText(raw.inputFormat).trim(),
        outputFormat: asText(raw.outputFormat).trim(),
        constraints: (raw.constraints ?? []).map(String),
        examples: (raw.examples ?? []).map((example) => ({
          input: asText(example.input),
          output: asText(example.output),
          explanation: asText(example.explanation).trim(),
        })),
        hints: (raw.hints ?? []).map(String),
        explanation: asText(raw.explanation).trim(),
        sourceUrl: asText(raw.sourceUrl).trim() || bestPracticeLink(entry.links),
        starterCode: { python: raw.starterCode?.python ?? "" },
        testCases: (raw.testCases ?? []).map((test) => ({
          input: asText(test.input),
          expectedOutput: asText(test.expectedOutput),
          isHidden: test.hidden === true,
        })),
        supportedLanguages: ["python"],
        isCustom: false,
      };
      if (includeReference && raw.referenceSolution) problem.referenceSolution = { python: raw.referenceSolution.python };
      problems.push(problem);
    });
  }

  if (offSheet.length > 0) {
    console.warn(
      `[library] ${offSheet.length} problem(s) are not on the A2Z sheet and were skipped:\n` +
        offSheet.map((p) => `  - ${p.title} (${p.slug}) in ${p.file}`).join("\n")
    );
  }

  problems.sort((a, b) => a.sectionOrder - b.sectionOrder || a.orderInSection - b.orderInSection);
  return problems;
}

// Sheet entries that have no written problem yet. They are listed in the
// library (so the counts match the sheet) but cannot be run or submitted.
export function buildPlaceholders(writtenSheetIds) {
  const placeholders = [];
  for (const entry of ENTRIES.values()) {
    if (writtenSheetIds.has(entry.sheetId)) continue;
    const links = Object.entries(entry.links).filter(([, url]) => url);
    placeholders.push({
      sheetId: entry.sheetId,
      slug: entry.slug,
      title: entry.title,
      section: entry.stepTitle,
      sectionOrder: entry.stepNo,
      sectionFullTitle: entry.stepFullTitle,
      orderInSection: entry.orderInStep,
      subStepNo: entry.subStepNo,
      subtopic: entry.subStepTitle,
      practiceLinks: entry.links,
      contentStatus: "placeholder",
      topic: entry.subStepTitle,
      difficulty: entry.difficulty,
      tags: [],
      statement:
        "This problem is on the A2Z sheet, but its statement, tests and starter code have not been written in DSAForge yet.\n\n" +
        (links.length ? `Until then you can practise it here:\n\n${links.map(([name, url]) => `- [${name}](${url})`).join("\n")}` : ""),
      inputFormat: "",
      outputFormat: "",
      constraints: [],
      examples: [],
      hints: [],
      explanation: "",
      sourceUrl: bestPracticeLink(entry.links),
      starterCode: { python: "" },
      testCases: [],
      supportedLanguages: [],
      isCustom: false,
    });
  }
  return placeholders;
}

// Everything that belongs in the library: written problems + placeholders.
export function loadLibrary() {
  const problems = loadProblems();
  const written = new Set(problems.map((p) => p.sheetId));
  return [...problems, ...buildPlaceholders(written)].sort(
    (a, b) => a.sectionOrder - b.sectionOrder || a.orderInSection - b.orderInSection
  );
}
