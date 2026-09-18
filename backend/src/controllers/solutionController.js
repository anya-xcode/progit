import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Solution, { APPROACH_TYPES } from "../models/Solution.js";
import Submission from "../models/Submission.js";
import { isLanguageEnabled } from "../config/languages.js";
import { autoRemoveIfEnabled, autoSyncIfEnabled } from "../services/github/syncService.js";
import { NOT_SUBMITTED, VERDICTS } from "../services/judge/verdicts.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { cleanString, escapeRegex, slugify } from "../utils/text.js";

const MAX_CODE_LENGTH = 64_000;

function readSolutionFields(body, { partial = false } = {}) {
  const fields = {};

  if (!partial || body.title !== undefined) {
    const title = cleanString(body.title, 80).trim();
    if (!title) throw badRequest("Approach name is required");
    if (!slugify(title)) throw badRequest("Approach name must contain letters or numbers");
    fields.title = title;
    fields.slug = slugify(title);
  }
  if (!partial || body.code !== undefined) {
    if (typeof body.code !== "string" || !body.code.trim()) throw badRequest("Code is required");
    if (body.code.length > MAX_CODE_LENGTH) throw badRequest("Code is too long (64 KB max)");
    fields.code = body.code;
  }
  if (body.approach !== undefined) {
    if (!APPROACH_TYPES.includes(body.approach)) throw badRequest(`Approach type must be one of ${APPROACH_TYPES.join(", ")}`);
    fields.approach = body.approach;
  }
  if (body.language !== undefined) {
    if (!isLanguageEnabled(body.language)) throw badRequest(`Language "${body.language}" is not supported yet`);
    fields.language = body.language;
  }
  if (body.timeComplexity !== undefined) fields.timeComplexity = cleanString(body.timeComplexity, 60).trim();
  if (body.spaceComplexity !== undefined) fields.spaceComplexity = cleanString(body.spaceComplexity, 60).trim();
  if (body.explanation !== undefined) fields.explanation = cleanString(body.explanation, 10_000);

  return fields;
}

async function assertNameAvailable(problemId, slug, title, ignoreId) {
  const existing = await Solution.exists({ problemId, slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
  if (existing) {
    throw conflict(`An approach named "${title}" already exists for this problem. Choose a different name.`);
  }
}

// GET /api/solutions?search=&verdict= — every saved approach (without code)
export async function listAllSolutions(req, res) {
  const filter = {};
  if (req.query.verdict) filter.verdict = String(req.query.verdict);

  let solutions = await Solution.find(filter, "-code")
    .sort({ updatedAt: -1 })
    .populate("problemId", "problemNumber title slug section topic difficulty")
    .lean();
  solutions = solutions.filter((solution) => solution.problemId);

  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
    solutions = solutions.filter(
      (s) => pattern.test(s.title) || pattern.test(s.problemId.title) || pattern.test(s.problemId.section)
    );
  }
  res.json(solutions);
}

// GET /api/solutions/:problemId — all approaches for one problem, with code
export async function listProblemSolutions(req, res) {
  const solutions = await Solution.find({ problemId: req.params.problemId }).sort({ createdAt: 1 }).lean();
  res.json(solutions);
}

// POST /api/solutions — always creates a new approach, never overwrites
export async function createSolution(req, res) {
  const body = req.body ?? {};
  if (!mongoose.isValidObjectId(body.problemId)) throw badRequest("A valid problemId is required");
  const problem = await Problem.exists({ _id: body.problemId });
  if (!problem) throw notFound("Problem not found");

  const fields = readSolutionFields(body);
  await assertNameAvailable(body.problemId, fields.slug, fields.title);

  // Saving code that was just submitted: link the submission and keep its verdict.
  let submission = null;
  if (body.submissionId && mongoose.isValidObjectId(body.submissionId)) {
    submission = await Submission.findOne({ _id: body.submissionId, problemId: body.problemId, solutionId: null });
    if (submission && submission.code !== fields.code) submission = null;
  }

  const solution = await Solution.create({
    ...fields,
    problemId: body.problemId,
    ...(submission && {
      verdict: submission.verdict,
      runtime: submission.runtime,
      memory: submission.memory,
      isDraft: submission.verdict !== VERDICTS.ACCEPTED,
      lastSubmittedAt: submission.submittedAt,
    }),
  });
  if (submission) {
    submission.solutionId = solution._id;
    await submission.save();
  }
  const syncing = await autoSyncIfEnabled(solution);
  res.status(201).json(syncing ? await Solution.findById(solution._id) : solution);
}

// PUT /api/solutions/:id — updates this approach only
export async function updateSolution(req, res) {
  const solution = await Solution.findById(req.params.id);
  if (!solution) throw notFound("Solution not found");

  const fields = readSolutionFields(req.body ?? {}, { partial: true });
  if (fields.slug && fields.slug !== solution.slug) {
    await assertNameAvailable(solution.problemId, fields.slug, fields.title, solution._id);
  }

  // Changed code has not been judged yet, so the old verdict no longer applies.
  if (fields.code !== undefined && fields.code !== solution.code) {
    Object.assign(fields, { verdict: NOT_SUBMITTED, runtime: null, memory: null, isDraft: true });
  }

  Object.assign(solution, fields);
  await solution.save();

  // Details edited on an accepted approach (e.g. explanation) → update GitHub.
  const syncing = await autoSyncIfEnabled(solution);
  res.json(syncing ? await Solution.findById(solution._id) : solution);
}

// DELETE /api/solutions/:id — submissions are kept for history. With auto-sync
// on, the approach's file is removed from GitHub as well.
export async function deleteSolution(req, res) {
  const solution = await Solution.findByIdAndDelete(req.params.id).lean();
  if (!solution) throw notFound("Solution not found");
  await Submission.updateMany({ solutionId: solution._id }, { $set: { solutionId: null } });

  let githubRemoval = null;
  if (solution.githubPath) {
    const problem = await Problem.findById(solution.problemId, "title").lean();
    githubRemoval = await autoRemoveIfEnabled([{ ...solution, problemTitle: problem?.title }]);
  }
  res.json({ message: "Solution deleted", githubRemovalQueued: Boolean(githubRemoval) });
}
