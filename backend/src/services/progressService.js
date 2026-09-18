import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import Submission from "../models/Submission.js";
import { VERDICTS } from "./judge/verdicts.js";

// Problem status is derived, not stored:
//   solved    = at least one Accepted submission
//   attempted = has submissions or saved solutions, but nothing accepted
//   unsolved  = no activity
export async function getProgressMaps() {
  const [acceptedIds, markedDone, submissionActivity, solutionActivity] = await Promise.all([
    Submission.distinct("problemId", { verdict: VERDICTS.ACCEPTED }),
    Problem.distinct("_id", { manualDoneAt: { $ne: null } }),
    Submission.aggregate([{ $group: { _id: "$problemId", lastActivity: { $max: "$submittedAt" } } }]),
    Solution.aggregate([
      { $group: { _id: "$problemId", count: { $sum: 1 }, lastActivity: { $max: "$updatedAt" } } },
    ]),
  ]);

  // Reference items (theory on the sheet) are ticked off instead of submitted.
  const solved = new Set([...acceptedIds, ...markedDone].map(String));
  const solutionCounts = new Map();
  const lastActivity = new Map();

  const touch = (id, date) => {
    const key = String(id);
    if (!lastActivity.has(key) || lastActivity.get(key) < date) lastActivity.set(key, date);
  };
  submissionActivity.forEach((row) => touch(row._id, row.lastActivity));
  solutionActivity.forEach((row) => {
    solutionCounts.set(String(row._id), row.count);
    touch(row._id, row.lastActivity);
  });

  return { solved, solutionCounts, lastActivity };
}

export function statusOf(problemId, maps) {
  const key = String(problemId);
  if (maps.solved.has(key)) return "solved";
  if (maps.lastActivity.has(key)) return "attempted";
  return "unsolved";
}
