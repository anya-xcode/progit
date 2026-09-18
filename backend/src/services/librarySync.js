import { loadLibrary } from "../data/loadProblems.js";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import Submission from "../models/Submission.js";

// Upserts the library (written problems + sheet placeholders) into MongoDB.
// Matching is by sheetId, so a problem keeps its _id — and the solutions and
// submissions that reference it — when its content is written later.
// Custom problems are never touched.
export async function syncProblemLibrary() {
  const library = loadLibrary();
  if (library.length === 0) return { total: 0, created: 0, ready: 0, removed: 0 };

  // Remove library rows that are no longer on the sheet *before* upserting, so
  // their slugs cannot collide with the rows being written. Rows with saved
  // work are kept and reported instead.
  const keep = new Set(library.map((problem) => problem.sheetId));
  const stale = await Problem.find({ isCustom: false, sheetId: { $nin: [...keep] } }, "_id title").lean();
  let removed = 0;
  for (const problem of stale) {
    const [solutions, submissions] = await Promise.all([
      Solution.countDocuments({ problemId: problem._id }),
      Submission.countDocuments({ problemId: problem._id }),
    ]);
    if (solutions === 0 && submissions === 0) {
      await Problem.deleteOne({ _id: problem._id });
      removed++;
    } else {
      console.warn(`[library] "${problem.title}" is no longer on the sheet but has saved work — keeping it.`);
    }
  }

  const result = await Problem.bulkWrite(
    library.map((problem, index) => ({
      updateOne: {
        filter: { sheetId: problem.sheetId },
        update: { $set: { ...problem, problemNumber: index + 1 } },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  return {
    total: library.length,
    created: result.upsertedCount,
    ready: library.filter((problem) => problem.contentStatus === "ready").length,
    removed,
  };
}
