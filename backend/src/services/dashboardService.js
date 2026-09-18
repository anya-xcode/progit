import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import Submission from "../models/Submission.js";
import { DIFFICULTIES } from "../data/sections.js";
import { computeStreaks, dayKey, LOCAL_TIME_ZONE, shiftDayKey } from "../utils/dates.js";
import { VERDICTS } from "./judge/verdicts.js";
import { getProgressMaps, statusOf } from "./progressService.js";

const PROBLEM_SUMMARY_FIELDS = "problemNumber title slug section topic difficulty isCustom";

async function acceptedDays() {
  const rows = await Submission.aggregate([
    { $match: { verdict: VERDICTS.ACCEPTED } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: LOCAL_TIME_ZONE } } } },
  ]);
  return rows.map((row) => row._id);
}

export async function getStats() {
  const [problems, maps, totalSolutions, acceptedSolutions, totalSubmissions, acceptedSubmissions, days] =
    await Promise.all([
      Problem.find({}, "_id").lean(),
      getProgressMaps(),
      Solution.countDocuments(),
      Solution.countDocuments({ verdict: VERDICTS.ACCEPTED }),
      Submission.countDocuments(),
      Submission.countDocuments({ verdict: VERDICTS.ACCEPTED }),
      acceptedDays(),
    ]);

  const existing = new Set(problems.map((p) => String(p._id)));
  const solvedProblems = [...maps.solved].filter((id) => existing.has(id)).length;
  const attemptedProblems = problems.filter((p) => statusOf(p._id, maps) === "attempted").length;
  const multiApproachProblems = [...maps.solutionCounts.values()].filter((count) => count >= 2).length;
  const streak = computeStreaks(days);

  return {
    totalProblems: problems.length,
    solvedProblems,
    attemptedProblems,
    totalSolutions,
    acceptedSolutions,
    totalSubmissions,
    acceptedSubmissions,
    multiApproachProblems,
    currentStreak: streak.current,
    longestStreak: streak.longest,
  };
}

export async function getProgress({ activityDays = 182 } = {}) {
  const [problems, maps] = await Promise.all([
    Problem.find({}, "section sectionOrder difficulty").lean(),
    getProgressMaps(),
  ]);

  const sections = new Map();
  const difficulties = new Map(DIFFICULTIES.map((d) => [d, { difficulty: d, total: 0, solved: 0 }]));

  for (const problem of problems) {
    const solved = statusOf(problem._id, maps) === "solved" ? 1 : 0;
    if (!sections.has(problem.section)) {
      sections.set(problem.section, { section: problem.section, order: problem.sectionOrder, total: 0, solved: 0 });
    }
    const section = sections.get(problem.section);
    section.total++;
    section.solved += solved;
    const difficulty = difficulties.get(problem.difficulty);
    if (difficulty) {
      difficulty.total++;
      difficulty.solved += solved;
    }
  }

  const since = new Date(Date.now() - (activityDays + 1) * 24 * 60 * 60 * 1000);
  const activityRows = await Submission.aggregate([
    { $match: { submittedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: LOCAL_TIME_ZONE } },
        submissions: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ["$verdict", VERDICTS.ACCEPTED] }, 1, 0] } },
      },
    },
  ]);
  const byDay = new Map(activityRows.map((row) => [row._id, row]));
  const today = dayKey();
  const activity = [];
  for (let offset = activityDays - 1; offset >= 0; offset--) {
    const date = shiftDayKey(today, -offset);
    const row = byDay.get(date);
    activity.push({ date, submissions: row?.submissions ?? 0, accepted: row?.accepted ?? 0 });
  }

  return {
    bySection: [...sections.values()].sort((a, b) => a.order - b.order),
    byDifficulty: [...difficulties.values()],
    activity,
  };
}

export async function getRecent() {
  const [recentSubmissions, recentSolutions, maps, multiApproachRows] = await Promise.all([
    Submission.find({}, "problemId solutionId verdict runtime memory passedCount totalCount language submittedAt")
      .sort({ submittedAt: -1 })
      .limit(8)
      .populate("problemId", PROBLEM_SUMMARY_FIELDS)
      .populate("solutionId", "title")
      .lean(),
    Solution.find({}, "-code")
      .sort({ updatedAt: -1 })
      .limit(6)
      .populate("problemId", PROBLEM_SUMMARY_FIELDS)
      .lean(),
    getProgressMaps(),
    Solution.aggregate([
      { $group: { _id: "$problemId", count: { $sum: 1 }, approaches: { $push: "$title" }, updatedAt: { $max: "$updatedAt" } } },
      { $match: { count: { $gte: 2 } } },
      { $sort: { updatedAt: -1 } },
      { $limit: 6 },
    ]),
  ]);

  // Continue solving: attempted-but-unsolved problems first, then the next
  // unsolved problems in sheet order.
  const attemptedIds = [...maps.lastActivity.entries()]
    .filter(([id]) => !maps.solved.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const attempted = await Problem.find({ _id: { $in: attemptedIds.slice(0, 5) } }, PROBLEM_SUMMARY_FIELDS).lean();
  attempted.sort((a, b) => attemptedIds.indexOf(String(a._id)) - attemptedIds.indexOf(String(b._id)));

  let continueSolving = attempted.map((p) => ({ ...p, status: "attempted" }));
  if (continueSolving.length < 5) {
    const excluded = [...maps.solved, ...maps.lastActivity.keys()];
    // Only suggest problems that can actually be solved today.
    const next = await Problem.find({ _id: { $nin: excluded }, contentStatus: "ready" }, PROBLEM_SUMMARY_FIELDS)
      .sort({ sectionOrder: 1, orderInSection: 1, problemNumber: 1 })
      .limit(5 - continueSolving.length)
      .lean();
    continueSolving = continueSolving.concat(next.map((p) => ({ ...p, status: "unsolved" })));
  }

  const multiProblems = await Problem.find({ _id: { $in: multiApproachRows.map((r) => r._id) } }, PROBLEM_SUMMARY_FIELDS).lean();
  const multiById = new Map(multiProblems.map((p) => [String(p._id), p]));
  const multiApproach = multiApproachRows
    .filter((row) => multiById.has(String(row._id)))
    .map((row) => ({ problem: multiById.get(String(row._id)), count: row.count, approaches: row.approaches }));

  return {
    recentSubmissions: recentSubmissions.filter((s) => s.problemId),
    recentSolutions: recentSolutions.filter((s) => s.problemId),
    continueSolving,
    multiApproach,
  };
}
