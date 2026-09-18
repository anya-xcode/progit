// End-to-end test of GitHub sync against an in-memory mock of the GitHub API.
// Uses a separate MongoDB database (dsaforge_github_test) and never contacts
// github.com.   npm run test:github
import { createMockGitHub } from "./lib/mockGitHub.js";

const mock = await createMockGitHub({ token: "test-token" }).listen();
process.env.MONGODB_URI = process.env.GITHUB_TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/dsaforge_github_test";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_API_URL = mock.url;
process.env.GITHUB_WEB_URL = mock.url;
process.env.GITHUB_CLIENT_ID = "test-client";
process.env.GITHUB_CLIENT_SECRET = "test-secret";

const { default: mongoose } = await import("mongoose");
const { createApp } = await import("../src/app.js");
const { env } = await import("../src/config/env.js");
const { syncProblemLibrary } = await import("../src/services/librarySync.js");
const { waitForSyncIdle } = await import("../src/services/github/syncService.js");
const { default: Solution } = await import("../src/models/Solution.js");

let passed = 0;
let failed = 0;
function check(name, condition, details = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${details ? `\n      ${details}` : ""}`);
  }
}

await mongoose.connect(env.mongoUri);
await mongoose.connection.db.dropDatabase();
await syncProblemLibrary();

const server = createApp().listen(0);
const api = `http://127.0.0.1:${server.address().port}/api`;
async function call(method, path, body) {
  const response = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: response.status, data, headers: response.headers };
}

const twoSum = (await call("GET", "/problems/two-sum")).data;
const HASH_MAP = `import sys


def two_sum(nums, target):
    seen = {}
    for j, value in enumerate(nums):
        if target - value in seen:
            return [seen[target - value], j]
        seen[value] = j


# --- Input/output handling ---
def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = [int(x) for x in data[2:2 + n]]
    i, j = two_sum(nums, target)
    print(i, j)


if __name__ == "__main__":
    main()
`;
const BRUTE = HASH_MAP.replace(
  /    seen = \{\}[\s\S]*?seen\[value\] = j\n/,
  "    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n"
);
const REPO = "ananya/dsa-solutions";
const folder = "03-Arrays/Two-Sum";

try {
  console.log("\nConnection");
  let status = (await call("GET", "/github/status")).data;
  check("token connection detected", status.connected && status.authMethod === "token" && status.user?.login === "ananya", JSON.stringify(status));
  check("not ready before a repository is selected", status.ready === false);
  check("status never exposes the token", !JSON.stringify(status).includes("test-token"));

  console.log("\nRepositories");
  const created = await call("POST", "/github/repositories", { name: "dsa-solutions", isPrivate: true });
  check("create repository", created.status === 201 && created.data.fullName === REPO, JSON.stringify(created.data));
  const duplicate = await call("POST", "/github/repositories", { name: "dsa-solutions" });
  check("duplicate repository name is a 400 with a reason", duplicate.status === 400 && /already exists/.test(duplicate.data.message));
  const repos = await call("GET", "/github/repositories");
  check("list repositories", repos.status === 200 && repos.data.some((r) => r.fullName === REPO));
  const badSelect = await call("POST", "/github/select-repository", { fullName: "ananya/missing" });
  check("selecting a missing repository fails clearly", badSelect.status === 400 && /not found/i.test(badSelect.data.message));
  status = (await call("POST", "/github/select-repository", { fullName: REPO })).data;
  check("select repository", status.ready && status.branch === "main" && status.autoSync === true, JSON.stringify(status));

  console.log("\nAuto-sync on accepted submit");
  const hash = (await call("POST", "/solutions", {
    problemId: twoSum._id,
    title: "Hash Map",
    approach: "Optimal",
    code: HASH_MAP,
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    explanation: "Remember each value's index.",
  })).data;
  check("saving a not-yet-accepted approach does not sync", hash.githubStatus === "not-synced");
  const submit = await call("POST", "/code/submit", { problemId: twoSum._id, code: HASH_MAP, solutionId: hash._id });
  check("submission accepted", submit.data.verdict === "Accepted", JSON.stringify(submit.data).slice(0, 300));
  check("accepted submit queues a sync", ["pending", "syncing", "synced"].includes(submit.data.solution?.githubStatus), submit.data.solution?.githubStatus);
  await waitForSyncIdle();

  let files = mock.files(REPO);
  let solution = await Solution.findById(hash._id).lean();
  check("solution marked synced with commit URL", solution.githubStatus === "synced" && solution.githubCommitUrl.includes("/commit/"), JSON.stringify(solution.githubSyncError));
  check("githubPath stored", solution.githubPath === `${folder}/hash-map.py`, solution.githubPath);
  for (const name of ["problem.md", "test_cases.txt", "README.md", "hash-map.py"]) {
    check(`created ${folder}/${name}`, files.has(`${folder}/${name}`));
  }
  check("root README lists the problem", files.get("README.md")?.includes("[Two Sum](03-Arrays/Two-Sum/README.md)"), files.get("README.md"));
  check("commit message", mock.log(REPO)[0].message === "Add Two Sum - Hash Map solution", mock.log(REPO)[0].message);
  const hashFile = files.get(`${folder}/hash-map.py`);
  check("solution file header", /# Approach: Hash Map \(Optimal\)\n# Time Complexity: O\(n\)\n# Space Complexity: O\(n\)/.test(hashFile), hashFile.slice(0, 200));
  check("solution file contains the code", hashFile.includes("seen[value] = j"));
  check("problem.md has statement, constraints, examples", /## Problem Statement[\s\S]*## Constraints[\s\S]*## Examples[\s\S]*## Test Cases/.test(files.get(`${folder}/problem.md`)));
  check("test_cases.txt includes hidden cases", /\(hidden\)/.test(files.get(`${folder}/test_cases.txt`)));

  console.log("\nSecond approach keeps the first");
  const brute = (await call("POST", "/solutions", { problemId: twoSum._id, title: "Brute Force", approach: "Brute Force", code: BRUTE, timeComplexity: "O(n^2)", spaceComplexity: "O(1)" })).data;
  await call("POST", "/code/submit", { problemId: twoSum._id, code: BRUTE, solutionId: brute._id });
  await waitForSyncIdle();
  files = mock.files(REPO);
  check("brute-force.py added", files.has(`${folder}/brute-force.py`));
  check("hash-map.py unchanged", files.get(`${folder}/hash-map.py`) === hashFile);
  check("problem README lists both approaches", /Brute Force[\s\S]*Hash Map|Hash Map[\s\S]*Brute Force/.test(files.get(`${folder}/README.md`)) && files.get(`${folder}/README.md`).includes("[brute-force.py](brute-force.py)"));
  check("commit message for second approach", mock.log(REPO)[0].message === "Add Two Sum - Brute Force solution", mock.log(REPO)[0].message);

  console.log("\nEditing an approach updates the same file");
  const commitsBefore = mock.log(REPO).length;
  const edited = (await call("PUT", `/solutions/${hash._id}`, { explanation: "Store value → index; look up the complement." })).data;
  check("details edit on accepted approach triggers sync", ["pending", "syncing", "synced"].includes(edited.githubStatus), edited.githubStatus);
  await waitForSyncIdle();
  files = mock.files(REPO);
  check("commit message says Update", mock.log(REPO)[0].message === "Update Two Sum - Hash Map solution", mock.log(REPO)[0].message);
  check("new commit created", mock.log(REPO).length === commitsBefore + 1);
  check("file updated in place", files.get(`${folder}/hash-map.py`).includes("look up the complement"));

  console.log("\nManual re-sync with no changes");
  const headBefore = mock.head(REPO);
  const manual = await call("POST", `/github/sync/${hash._id}`);
  check("manual sync accepted (202)", manual.status === 202);
  await waitForSyncIdle();
  check("no empty commit when nothing changed", mock.head(REPO) === headBefore);
  check("still synced", (await Solution.findById(hash._id).lean()).githubStatus === "synced");

  console.log("\nCode change makes GitHub copy outdated until accepted again");
  const changed = (await call("PUT", `/solutions/${hash._id}`, { code: `${HASH_MAP}\n# tweak\n` })).data;
  check("changed code → outdated + Not Submitted, no sync", changed.githubStatus === "outdated" && changed.verdict === "Not Submitted");
  const manualDraft = await call("POST", `/github/sync/${hash._id}`);
  check("manual sync refuses non-accepted approach", manualDraft.status === 400 && /accepted/i.test(manualDraft.data.message));

  console.log("\nRename moves the file");
  await call("PUT", `/solutions/${brute._id}`, { title: "Nested Loops" });
  await waitForSyncIdle();
  files = mock.files(REPO);
  check("old brute-force.py removed", !files.has(`${folder}/brute-force.py`));
  check("nested-loops.py added", files.has(`${folder}/nested-loops.py`));
  check("githubPath updated", (await Solution.findById(brute._id).lean()).githubPath === `${folder}/nested-loops.py`);

  console.log("\nFailure and retry");
  mock.failNext(/POST .*\/git\/commits$/, 500, "GitHub is having a bad day");
  await call("PUT", `/solutions/${brute._id}`, { explanation: "Try every pair." });
  await waitForSyncIdle();
  solution = await Solution.findById(brute._id).lean();
  check("failed sync recorded with message", solution.githubStatus === "failed" && /bad day/.test(solution.githubSyncError), JSON.stringify(solution.githubSyncError));
  const historyAfterFailure = (await call("GET", "/github/syncs")).data;
  check("history shows the failure", historyAfterFailure[0].syncStatus === "failed");
  await call("POST", `/github/sync/${brute._id}`);
  await waitForSyncIdle();
  check("retry succeeds", (await Solution.findById(brute._id).lean()).githubStatus === "synced");
  check("retry committed the edit", mock.files(REPO).get(`${folder}/nested-loops.py`).includes("Try every pair."));

  console.log("\nAuth errors");
  mock.failNext(/POST .*\/git\/trees$/, 401, "Bad credentials");
  await call("PUT", `/solutions/${brute._id}`, { explanation: "Check all pairs." });
  await waitForSyncIdle();
  check("401 explained", /token/i.test((await Solution.findById(brute._id).lean()).githubSyncError));
  await call("POST", "/github/sync-all");
  await waitForSyncIdle();
  check("sync-all picks up failed approaches", (await Solution.findById(brute._id).lean()).githubStatus === "synced");

  console.log("\nAuto-sync OFF");
  await call("PUT", "/github/settings", { autoSync: false });
  const headOff = mock.head(REPO);
  await call("PUT", `/solutions/${brute._id}`, { explanation: "Pairs, pairs, pairs." });
  await waitForSyncIdle();
  check("no commit while auto-sync is off", mock.head(REPO) === headOff);
  check("approach shows outdated", (await Solution.findById(brute._id).lean()).githubStatus === "outdated");
  const counts = (await call("GET", "/github/status")).data.counts;
  // Hash Map is outdated too (its code changed earlier) but is not accepted.
  check("status counts outdated approaches", counts.outdated === 2 && counts.readyToSync === 1, JSON.stringify(counts));
  await call("PUT", "/github/settings", { autoSync: true });

  console.log("\nDelete removes the file");
  await call("POST", "/github/sync-all");
  await waitForSyncIdle();
  const deleted = await call("DELETE", `/solutions/${brute._id}`);
  check("delete queues GitHub removal", deleted.data.githubRemovalQueued === true);
  await waitForSyncIdle();
  files = mock.files(REPO);
  check("nested-loops.py removed", !files.has(`${folder}/nested-loops.py`));
  check("problem README no longer lists it", !files.get(`${folder}/README.md`).includes("Nested Loops"));
  check("remove commit message", mock.log(REPO)[0].message === "Remove Two Sum - Nested Loops solution", mock.log(REPO)[0].message);

  console.log("\nConcurrent submits are serialized");
  const lcs = (await call("GET", "/problems/largest-element")).data;
  const largestCode = lcs.starterCode.python.replace(/    # [^\n]*\n    pass/, "    return max(nums)");
  const a = (await call("POST", "/solutions", { problemId: lcs._id, title: "Built-in Max", code: largestCode })).data;
  const b = (await call("POST", "/solutions", { problemId: lcs._id, title: "Linear Scan", code: largestCode.replace("return max(nums)", "best = nums[0]\n    for x in nums:\n        best = max(best, x)\n    return best") })).data;
  const results = await Promise.all([
    call("POST", "/code/submit", { problemId: lcs._id, code: largestCode, solutionId: a._id }),
    call("POST", "/code/submit", { problemId: lcs._id, code: largestCode.replace("return max(nums)", "best = nums[0]\n    for x in nums:\n        best = max(best, x)\n    return best"), solutionId: b._id }),
  ]);
  check("both accepted", results.every((r) => r.data.verdict === "Accepted"), results.map((r) => r.data.verdict || r.data.message).join(", "));
  await waitForSyncIdle();
  files = mock.files(REPO);
  const largestFolder = "03-Arrays/Largest-Element-in-an-Array";
  check("both files present", files.has(`${largestFolder}/built-in-max.py`) && files.has(`${largestFolder}/linear-scan.py`));
  check("root README lists both problems", /Two Sum/.test(files.get("README.md")) && /Largest Element in an Array/.test(files.get("README.md")));

  console.log("\nEmpty repository, new branch and base folder");
  mock.addRepo("ananya", "empty-repo", { autoInit: false });
  status = (await call("POST", "/github/select-repository", { fullName: "ananya/empty-repo", branch: "solutions", basePath: "dsa-solutions" })).data;
  check("switching repository resets sync state", status.counts["not-synced"] >= 3, JSON.stringify(status.counts));
  await call("POST", "/github/sync-all");
  await waitForSyncIdle();
  const emptyFiles = mock.files("ananya/empty-repo", "solutions");
  check("empty repo initialized and synced on new branch", emptyFiles.has("dsa-solutions/README.md") && mock.head("ananya/empty-repo", "main"), [...emptyFiles.keys()].join(", "));
  check("non-accepted approach (Hash Map, code changed) is not synced", !emptyFiles.has("dsa-solutions/03-Arrays/Two-Sum/hash-map.py"));
  check("accepted approaches synced under base folder", emptyFiles.has(`dsa-solutions/${largestFolder}/linear-scan.py`), [...emptyFiles.keys()].join(", "));
  check("batch commit message", /^Sync \d+ solutions from DSAForge/.test(mock.log("ananya/empty-repo", "solutions")[0].message), mock.log("ananya/empty-repo", "solutions")[0].message);
  const badPath = await call("PUT", "/github/settings", { basePath: "../escape" });
  check("base folder rejects '..'", badPath.status === 400);

  console.log("\nOAuth flow");
  const start = await call("GET", "/github/oauth/start");
  const authorizeUrl = start.headers.get("location");
  check("oauth start redirects to GitHub authorize", start.status === 302 && authorizeUrl.startsWith(`${mock.url}/login/oauth/authorize`), authorizeUrl);
  const authorize = await fetch(authorizeUrl, { redirect: "manual" });
  const callback = new URL(authorize.headers.get("location"));
  const callbackResponse = await call("GET", `/github/oauth/callback${callback.search}`);
  check("callback redirects back to the app as connected", callbackResponse.headers.get("location")?.endsWith("/github?connected=1"), callbackResponse.headers.get("location"));
  status = (await call("GET", "/github/status")).data;
  check("status reports oauth method", status.authMethod === "oauth" && status.connected);
  const replay = await call("GET", `/github/oauth/callback${callback.search}`);
  check("replayed state is rejected", /error=/.test(replay.headers.get("location") ?? ""));
  status = (await call("POST", "/github/disconnect")).data;
  check("disconnect falls back to GITHUB_TOKEN", status.authMethod === "token");
} catch (error) {
  failed++;
  console.error(error);
} finally {
  server.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  await mock.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
