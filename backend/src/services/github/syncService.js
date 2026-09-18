import { createHash } from "node:crypto";
import path from "node:path";
import { env } from "../../config/env.js";
import GitHubSync from "../../models/GitHubSync.js";
import Problem from "../../models/Problem.js";
import Solution from "../../models/Solution.js";
import { badRequest, conflict } from "../../utils/httpError.js";
import { createQueue } from "../execution/queue.js";
import { VERDICTS } from "../judge/verdicts.js";
import { createOctokit, describeGitHubError, getSettings, resolveAuth } from "./client.js";
import { isReady } from "./connectionService.js";
import { commitFiles } from "./gitCommit.js";
import {
  joinPath,
  problemFolder,
  renderProblemMd,
  renderProblemReadme,
  renderRootReadme,
  renderSolutionFile,
  renderTestCases,
  solutionPath,
} from "./repoFiles.js";

// Commits to the same branch must not overlap, so syncs run one at a time.
const queue = createQueue(1);
let runningJobs = 0;
const MAX_SOLUTIONS_PER_COMMIT = 50;

function enqueue(job) {
  runningJobs++;
  queue
    .run(job)
    .catch((error) => console.error("[github] sync job crashed:", error))
    .finally(() => runningJobs--);
}

// For tests and scripts: resolves once every queued sync has finished.
export async function waitForSyncIdle() {
  while (runningJobs > 0) await new Promise((resolve) => setTimeout(resolve, 50));
}

function contentHash(solution) {
  const fields = [solution.title, solution.approach, solution.code, solution.timeComplexity, solution.spaceComplexity, solution.explanation];
  return createHash("sha1").update(JSON.stringify(fields)).digest("hex");
}

async function loadTarget() {
  const [auth, settings] = await Promise.all([resolveAuth(), getSettings()]);
  if (!auth) throw conflict("GitHub is not connected. Add GITHUB_TOKEN to backend/.env or connect with GitHub.");
  if (!isReady(settings)) throw conflict("Select a repository on the GitHub page first.");
  return {
    octokit: createOctokit(auth.token),
    owner: settings.repository.owner,
    repo: settings.repository.name,
    fullName: settings.repository.fullName,
    branch: settings.branch,
    basePath: settings.basePath,
    autoSync: settings.autoSync,
  };
}

function commitUrlFor(target, result) {
  return result.commitUrl || `${env.github.webUrl}/${target.fullName}/commit/${result.commitSha}`;
}

// Root README lists every approach currently on GitHub (plus `extra`).
async function rootReadmeFile(target, { includeIds = [], excludeIds = [] } = {}) {
  const solutions = await Solution.find({
    _id: { $nin: excludeIds },
    $or: [{ githubPath: { $ne: "" } }, { _id: { $in: includeIds } }],
  })
    .sort({ createdAt: 1 })
    .populate("problemId")
    .lean();

  const groups = new Map();
  for (const solution of solutions) {
    if (!solution.problemId) continue;
    const key = String(solution.problemId._id);
    if (!groups.has(key)) groups.set(key, { problem: solution.problemId, solutions: [] });
    groups.get(key).solutions.push(solution);
  }
  return { path: joinPath(target.basePath, "README.md"), content: renderRootReadme([...groups.values()]) };
}

// ---------------------------------------------------------------------------
// Add / update approaches
// ---------------------------------------------------------------------------

// Marks accepted approaches as pending and queues ONE commit for them.
// Returns the created history records.
export async function queueSolutionSync(solutionIds, { requireAccepted = true } = {}) {
  const target = await loadTarget();
  const solutions = await Solution.find({ _id: { $in: solutionIds } }).populate("problemId", "title");
  const eligible = solutions.filter((s) => s.problemId && (!requireAccepted || s.verdict === VERDICTS.ACCEPTED));
  if (eligible.length === 0) {
    throw badRequest("Only accepted approaches are synced. Submit the approach and get Accepted first.");
  }

  const batches = [];
  for (let i = 0; i < eligible.length; i += MAX_SOLUTIONS_PER_COMMIT) batches.push(eligible.slice(i, i + MAX_SOLUTIONS_PER_COMMIT));

  const allRecords = [];
  for (const batch of batches) {
    const ids = batch.map((s) => s._id);
    await Solution.updateMany({ _id: { $in: ids } }, { $set: { githubStatus: "pending", githubSyncError: "" } });
    const records = await GitHubSync.insertMany(
      batch.map((s) => ({
        solutionId: s._id,
        problemId: s.problemId._id,
        problemTitle: s.problemId.title,
        solutionTitle: s.title,
        action: "upsert",
        repository: target.fullName,
        branch: target.branch,
        syncStatus: "pending",
      }))
    );
    allRecords.push(...records);
    enqueue(() => runUpsert(ids, records.map((r) => r._id)));
  }
  return allRecords;
}

async function runUpsert(solutionIds, recordIds) {
  let solutions = [];
  try {
    const target = await loadTarget();
    await Solution.updateMany({ _id: { $in: solutionIds } }, { $set: { githubStatus: "syncing" } });
    await GitHubSync.updateMany({ _id: { $in: recordIds } }, { $set: { syncStatus: "syncing" } });

    // Use the latest saved data; skip approaches deleted or no longer accepted.
    solutions = (await Solution.find({ _id: { $in: solutionIds } }).populate("problemId").lean()).filter(
      (s) => s.problemId && s.verdict === VERDICTS.ACCEPTED
    );
    const skippedIds = solutionIds.filter((id) => !solutions.some((s) => String(s._id) === String(id)));
    if (skippedIds.length) {
      await Solution.updateMany(
        { _id: { $in: skippedIds } },
        { $set: { githubStatus: "failed", githubSyncError: "Not synced: the approach is no longer accepted." } }
      );
      await GitHubSync.updateMany(
        { _id: { $in: recordIds }, solutionId: { $in: skippedIds } },
        { $set: { syncStatus: "failed", error: "The approach was deleted or is no longer accepted." } }
      );
    }
    if (solutions.length === 0) return;

    const syncingIds = solutions.map((s) => s._id);
    const hashes = new Map(solutions.map((s) => [String(s._id), contentHash(s)]));
    const files = [];
    const changes = [];

    const problemIds = [...new Set(solutions.map((s) => String(s.problemId._id)))];
    for (const problemId of problemIds) {
      const problem = solutions.find((s) => String(s.problemId._id) === problemId).problemId;
      const folder = problemFolder(problem, target.basePath);
      const syncingHere = solutions.filter((s) => String(s.problemId._id) === problemId);

      // Every approach of this problem that is, or will be, on GitHub.
      const onGitHub = await Solution.find({
        problemId,
        $or: [{ githubPath: { $ne: "" } }, { _id: { $in: syncingIds } }],
      })
        .sort({ createdAt: 1 })
        .lean();
      const latest = onGitHub.map((s) => syncingHere.find((x) => String(x._id) === String(s._id)) ?? s);

      files.push(
        { path: joinPath(folder, "problem.md"), content: renderProblemMd(problem) },
        { path: joinPath(folder, "test_cases.txt"), content: renderTestCases(problem) },
        { path: joinPath(folder, "README.md"), content: renderProblemReadme(problem, latest) }
      );

      for (const solution of syncingHere) {
        const filePath = solutionPath(problem, solution, target.basePath);
        files.push({ path: filePath, content: renderSolutionFile(problem, solution) });
        // Renamed approach: remove the file under its old name.
        if (solution.githubPath && solution.githubPath !== filePath) files.push({ path: solution.githubPath, content: null });
        changes.push({ solution, problem, filePath });
      }
    }
    files.push(await rootReadmeFile(target, { includeIds: syncingIds }));

    const result = await commitFiles(target.octokit, {
      owner: target.owner,
      repo: target.repo,
      branch: target.branch,
      files,
      buildMessage: (existing) => {
        const lines = changes.map(
          ({ solution, problem, filePath }) =>
            `${existing.has(filePath) ? "Update" : "Add"} ${problem.title} - ${solution.title} solution`
        );
        return lines.length === 1 ? lines[0] : `Sync ${lines.length} solutions from DSAForge\n\n${lines.map((l) => `- ${l}`).join("\n")}`;
      },
    });

    const commitUrl = commitUrlFor(target, result);
    const now = new Date();
    for (const { solution, filePath } of changes) {
      const current = await Solution.findById(solution._id);
      if (!current) continue;
      current.githubPath = filePath;
      // Keep the link to the commit that last changed files when nothing changed now.
      if (result.changed || !current.githubCommitUrl) current.githubCommitUrl = commitUrl;
      current.githubSyncedAt = now;
      current.githubSyncError = "";
      // Edited while the sync was running? Then GitHub already lags behind.
      current.githubStatus = contentHash(current) === hashes.get(String(solution._id)) ? "synced" : "outdated";
      await Solution.updateOne(
        { _id: current._id },
        {
          $set: {
            githubPath: current.githubPath,
            githubCommitUrl: current.githubCommitUrl,
            githubSyncedAt: now,
            githubSyncError: "",
            githubStatus: current.githubStatus,
          },
        },
        { timestamps: false }
      );
      await GitHubSync.updateMany(
        { _id: { $in: recordIds }, solutionId: solution._id },
        {
          $set: {
            syncStatus: "synced",
            filePath,
            commitSha: result.commitSha,
            commitUrl: current.githubCommitUrl,
            commitMessage: result.message,
            changed: result.changed,
            syncedAt: now,
          },
        }
      );
    }
  } catch (error) {
    const message = describeGitHubError(error);
    console.error(`[github] sync failed: ${message}`);
    await Solution.updateMany(
      { _id: { $in: solutionIds }, githubStatus: { $in: ["pending", "syncing"] } },
      { $set: { githubStatus: "failed", githubSyncError: message } },
      { timestamps: false }
    );
    await GitHubSync.updateMany(
      { _id: { $in: recordIds }, syncStatus: { $in: ["pending", "syncing"] } },
      { $set: { syncStatus: "failed", error: message } }
    );
  }
}

// ---------------------------------------------------------------------------
// Remove approaches (after they are deleted in the app)
// ---------------------------------------------------------------------------

// `deleted`: plain objects of approaches already removed from MongoDB, all
// from the same problem. `problemDeleted`: the whole custom problem is gone.
export async function queueSolutionRemoval(deleted, { problemDeleted = false } = {}) {
  const synced = deleted.filter((s) => s.githubPath);
  if (synced.length === 0) return null;

  const target = await loadTarget();
  if (!target.autoSync) return null;

  const record = await GitHubSync.create({
    solutionId: synced[0]._id,
    problemId: synced[0].problemId,
    problemTitle: synced[0].problemTitle ?? "",
    solutionTitle: synced.map((s) => s.title).join(", "),
    action: "delete",
    repository: target.fullName,
    branch: target.branch,
    filePath: synced.map((s) => s.githubPath).join(", "),
    syncStatus: "pending",
  });
  enqueue(() => runRemoval(synced, record._id, { problemDeleted }));
  return record;
}

async function runRemoval(deleted, recordId, { problemDeleted }) {
  try {
    const target = await loadTarget();
    await GitHubSync.updateOne({ _id: recordId }, { $set: { syncStatus: "syncing" } });

    const problem = problemDeleted ? null : await Problem.findById(deleted[0].problemId).lean();
    const folder = path.posix.dirname(deleted[0].githubPath);
    const files = deleted.map((s) => ({ path: s.githubPath, content: null }));

    const remaining = problem
      ? await Solution.find({ problemId: problem._id, githubPath: { $ne: "" } }).sort({ createdAt: 1 }).lean()
      : [];
    if (problem && remaining.length > 0) {
      files.push({ path: joinPath(folder, "README.md"), content: renderProblemReadme(problem, remaining) });
    } else {
      for (const name of ["problem.md", "test_cases.txt", "README.md"]) files.push({ path: joinPath(folder, name), content: null });
    }
    files.push(await rootReadmeFile(target, { excludeIds: deleted.map((s) => s._id) }));

    const problemTitle = problem?.title ?? deleted[0].problemTitle ?? "problem";
    const result = await commitFiles(target.octokit, {
      owner: target.owner,
      repo: target.repo,
      branch: target.branch,
      files,
      buildMessage: () =>
        problemDeleted
          ? `Remove ${problemTitle} and its solutions`
          : `Remove ${problemTitle} - ${deleted.map((s) => s.title).join(", ")} solution${deleted.length > 1 ? "s" : ""}`,
    });

    await GitHubSync.updateOne(
      { _id: recordId },
      {
        $set: {
          syncStatus: "synced",
          commitSha: result.commitSha,
          commitUrl: commitUrlFor(target, result),
          commitMessage: result.message,
          changed: result.changed,
          syncedAt: new Date(),
        },
      }
    );
  } catch (error) {
    const message = describeGitHubError(error);
    console.error(`[github] removal failed: ${message}`);
    await GitHubSync.updateOne({ _id: recordId }, { $set: { syncStatus: "failed", error: message } });
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

// Called after an approach is saved or submitted. Syncs it when auto-sync is
// on, GitHub is ready and the approach is accepted but not yet up to date.
export async function autoSyncIfEnabled(solution) {
  try {
    if (!solution || solution.verdict !== VERDICTS.ACCEPTED || solution.githubStatus === "synced") return false;
    if (["pending", "syncing"].includes(solution.githubStatus)) return false;
    const [auth, settings] = await Promise.all([resolveAuth(), getSettings()]);
    if (!auth || !settings.autoSync || !isReady(settings)) return false;
    await queueSolutionSync([solution._id]);
    return true;
  } catch (error) {
    console.error(`[github] auto-sync not started: ${error.message}`);
    return false;
  }
}

export async function autoRemoveIfEnabled(deleted, options) {
  try {
    const auth = await resolveAuth();
    if (!auth) return null;
    const settings = await getSettings();
    if (!isReady(settings) || !settings.autoSync) return null;
    return await queueSolutionRemoval(deleted, options);
  } catch (error) {
    console.error(`[github] removal not started: ${error.message}`);
    return null;
  }
}

export async function syncAllPending() {
  const solutions = await Solution.find(
    { verdict: VERDICTS.ACCEPTED, githubStatus: { $in: ["not-synced", "outdated", "failed"] } },
    "_id"
  ).lean();
  if (solutions.length === 0) return [];
  return queueSolutionSync(solutions.map((s) => s._id));
}

// A server restart interrupts queued syncs; surface them as failed so the
// user can retry.
export async function recoverInterruptedSyncs() {
  const message = "Sync was interrupted because the server restarted. Retry the sync.";
  const [solutions] = await Promise.all([
    Solution.updateMany(
      { githubStatus: { $in: ["pending", "syncing"] } },
      { $set: { githubStatus: "failed", githubSyncError: message } },
      { timestamps: false }
    ),
    GitHubSync.updateMany({ syncStatus: { $in: ["pending", "syncing"] } }, { $set: { syncStatus: "failed", error: message } }),
  ]);
  return solutions.modifiedCount;
}
