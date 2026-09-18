import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import Submission from "../models/Submission.js";
import { CUSTOM_SECTION, DIFFICULTIES, SECTIONS } from "../data/sections.js";
import { autoRemoveIfEnabled } from "../services/github/syncService.js";
import { getProgressMaps, statusOf } from "../services/progressService.js";
import { badRequest, forbidden, notFound } from "../utils/httpError.js";
import { cleanString, escapeRegex, slugify } from "../utils/text.js";

const LIST_FIELDS =
  "problemNumber sheetId title slug section sectionOrder sectionFullTitle orderInSection subStepNo topic subtopic difficulty tags isCustom contentStatus practiceLinks";
const STATUSES = ["solved", "attempted", "unsolved"];

const DEFAULT_CUSTOM_STARTER = `import sys


def solve(data: str) -> str:
    # Parse the raw input and return the answer as a string.
    pass


# --- Input/output handling ---
def main():
    data = sys.stdin.read()
    print(solve(data))


if __name__ == "__main__":
    main()
`;

// GET /api/problems?search=&section=&topic=&difficulty=&status=
export async function listProblems(req, res) {
  const { search, section, topic, difficulty, status } = req.query;
  const filter = {};

  if (section) filter.section = String(section);
  if (topic) filter.topic = String(topic);
  if (difficulty) filter.difficulty = String(difficulty);
  // Every word must match at least one field, so "sum two" finds "Two Sum".
  const terms = String(search ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length > 0) {
    filter.$and = terms.map((term) => {
      const pattern = new RegExp(escapeRegex(term), "i");
      const fields = [{ title: pattern }, { slug: pattern }, { topic: pattern }, { subtopic: pattern }, { section: pattern }, { tags: pattern }];
      if (/^#?\d+$/.test(term)) fields.push({ problemNumber: Number(term.replace("#", "")) });
      return { $or: fields };
    });
  }

  const [problems, maps] = await Promise.all([
    Problem.find(filter, LIST_FIELDS).sort({ sectionOrder: 1, orderInSection: 1, problemNumber: 1 }).lean(),
    getProgressMaps(),
  ]);

  let rows = problems.map((problem) => ({
    ...problem,
    status: statusOf(problem._id, maps),
    solutionCount: maps.solutionCounts.get(String(problem._id)) ?? 0,
  }));
  if (STATUSES.includes(status)) rows = rows.filter((row) => row.status === status);
  // "Solvable here" means it can actually be run and submitted, so reference
  // entries (theory, ticked off by hand) are excluded too.
  if (req.query.ready === "true") rows = rows.filter((row) => row.contentStatus === "ready");

  res.json({ problems: rows, total: rows.length });
}

// GET /api/problems/meta — the sheet's steps and the filter values
export async function getProblemMeta(req, res) {
  const [topics, customCount] = await Promise.all([Problem.distinct("topic"), Problem.countDocuments({ isCustom: true })]);

  const steps = SECTIONS.map((section) => ({
    stepNo: section.order,
    name: section.name,
    fullTitle: section.fullTitle,
    total: section.total,
    subSteps: section.subSteps,
  }));
  if (customCount > 0) {
    steps.push({ stepNo: CUSTOM_SECTION.order, name: CUSTOM_SECTION.name, fullTitle: "Your own problems", total: customCount, subSteps: [] });
  }

  res.json({
    steps,
    sections: steps.map((step) => step.name),
    topics: topics.filter(Boolean).sort(),
    difficulties: DIFFICULTIES,
  });
}

// GET /api/problems/:slug  (hidden test cases are only included for custom
// problems when ?includeHidden=true, for the edit form)
export async function getProblem(req, res) {
  const problem = await Problem.findOne({ slug: req.params.slug }).lean();
  if (!problem) throw notFound("Question not found in your library.");

  const maps = await getProgressMaps();
  const includeHidden = problem.isCustom && req.query.includeHidden === "true";
  const visibleTests = problem.testCases.filter((t) => !t.isHidden);

  res.json({
    ...problem,
    testCases: includeHidden ? problem.testCases : visibleTests,
    hiddenTestCount: problem.testCases.length - visibleTests.length,
    status: statusOf(problem._id, maps),
    solutionCount: maps.solutionCounts.get(String(problem._id)) ?? 0,
  });
}

function readProblemBody(body) {
  const title = cleanString(body.title, 150).trim();
  const statement = cleanString(body.statement).trim();
  const topic = cleanString(body.topic, 80).trim();
  const difficulty = body.difficulty;

  if (!title) throw badRequest("Title is required");
  if (!statement) throw badRequest("Problem statement is required");
  if (!topic) throw badRequest("Topic is required");
  if (!DIFFICULTIES.includes(difficulty)) throw badRequest(`Difficulty must be one of ${DIFFICULTIES.join(", ")}`);

  const list = (value) =>
    (Array.isArray(value) ? value : String(value ?? "").split("\n"))
      .map((item) => cleanString(String(item), 500).trim())
      .filter(Boolean);

  const testCases = (Array.isArray(body.testCases) ? body.testCases : []).map((test) => ({
    input: cleanString(test.input, 100_000),
    expectedOutput: cleanString(test.expectedOutput, 100_000),
    isHidden: Boolean(test.isHidden),
  }));
  if (testCases.length === 0) throw badRequest("Add at least one test case with an expected output");
  if (testCases.some((test) => test.expectedOutput.trim() === "")) throw badRequest("Every test case needs an expected output");
  if (!testCases.some((test) => !test.isHidden)) testCases[0].isHidden = false;

  const sectionName = SECTIONS.some((s) => s.name === body.section) ? body.section : CUSTOM_SECTION.name;
  const sectionOrder = SECTIONS.find((s) => s.name === sectionName)?.order ?? CUSTOM_SECTION.order;
  const sourceUrl = cleanString(body.sourceUrl, 500).trim();
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw badRequest("Source URL must start with http:// or https://");

  return {
    title,
    statement,
    topic,
    difficulty,
    section: sectionName,
    sectionOrder,
    subtopic: cleanString(body.subtopic, 80).trim(),
    tags: list(body.tags).map((tag) => tag.toLowerCase()),
    inputFormat: cleanString(body.inputFormat).trim(),
    outputFormat: cleanString(body.outputFormat).trim(),
    constraints: list(body.constraints),
    hints: list(body.hints),
    explanation: cleanString(body.explanation).trim(),
    examples: (Array.isArray(body.examples) ? body.examples : [])
      .map((example) => ({
        input: cleanString(example.input, 10_000),
        output: cleanString(example.output, 10_000),
        explanation: cleanString(example.explanation, 2_000).trim(),
      }))
      .filter((example) => example.input.trim() || example.output.trim()),
    testCases,
    sourceUrl,
    starterCode: { python: cleanString(body.starterCode?.python, 64_000).trim() ? body.starterCode.python : DEFAULT_CUSTOM_STARTER },
  };
}

async function uniqueSlug(title, ignoreId) {
  const base = slugify(title) || "custom-problem";
  let slug = base;
  for (let n = 2; await Problem.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

// PUT /api/problems/:id/done — tick a reference item off (or untick it)
export async function setProblemDone(req, res) {
  const problem = await Problem.findById(req.params.id);
  if (!problem) throw notFound("Problem not found");
  if (problem.contentStatus !== "reference") {
    throw badRequest("Only reference items can be marked as done. Solve this problem by submitting code.");
  }
  problem.manualDoneAt = req.body?.done === false ? null : new Date();
  await problem.save();
  res.json({ _id: problem._id, manualDoneAt: problem.manualDoneAt, status: problem.manualDoneAt ? "solved" : "unsolved" });
}

// POST /api/problems — add a custom problem
export async function createProblem(req, res) {
  const data = readProblemBody(req.body ?? {});
  const lastCustom = await Problem.findOne({ isCustom: true }).sort({ problemNumber: -1 }).lean();
  const problemNumber = Math.max(1000, lastCustom?.problemNumber ?? 1000) + 1;

  const problem = await Problem.create({
    ...data,
    slug: await uniqueSlug(data.title),
    problemNumber,
    orderInSection: problemNumber,
    isCustom: true,
    supportedLanguages: ["python"],
  });
  res.status(201).json(problem);
}

// PUT /api/problems/:id — library problems are managed by the YAML files
export async function updateProblem(req, res) {
  const problem = await Problem.findById(req.params.id);
  if (!problem) throw notFound("Problem not found");
  if (!problem.isCustom) throw forbidden("Library problems are read-only. Edit backend/src/data/problems instead.");

  const data = readProblemBody(req.body ?? {});
  if (data.title !== problem.title) problem.slug = await uniqueSlug(data.title, problem._id);
  Object.assign(problem, data);
  await problem.save();
  res.json(problem);
}

// DELETE /api/problems/:id — removes a custom problem with its solutions and submissions
export async function deleteProblem(req, res) {
  const problem = await Problem.findById(req.params.id);
  if (!problem) throw notFound("Problem not found");
  if (!problem.isCustom) throw forbidden("Library problems cannot be deleted");

  const synced = await Solution.find({ problemId: problem._id, githubPath: { $ne: "" } }).lean();
  if (synced.length > 0) {
    await autoRemoveIfEnabled(synced.map((s) => ({ ...s, problemTitle: problem.title })), { problemDeleted: true });
  }

  await Promise.all([
    Solution.deleteMany({ problemId: problem._id }),
    Submission.deleteMany({ problemId: problem._id }),
    problem.deleteOne(),
  ]);
  res.json({ message: "Problem deleted" });
}
