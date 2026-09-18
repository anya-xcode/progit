import { createHash } from "node:crypto";

const FILE_MODE = "100644";

// Git's blob id for `content`, used to skip files that did not change.
export function gitBlobSha(content) {
  const body = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

function isEmptyRepositoryError(error) {
  return error.status === 409 || (error.status === 404 && /empty/i.test(error.response?.data?.message ?? ""));
}

// Returns the head commit sha of `branch`, creating the branch (or the very
// first commit of an empty repository) when needed.
async function ensureBranchHead(octokit, { owner, repo, branch }, initialized = false) {
  try {
    const { data } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    return data.object.sha;
  } catch (error) {
    if (isEmptyRepositoryError(error) && !initialized) {
      // The Git Data API cannot commit to an empty repository. Create a first
      // commit on the default branch, then continue (branching from it if needed).
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: "README.md",
        message: "Initialize DSA solutions repository",
        content: Buffer.from("# DSA Solutions\n").toString("base64"),
      });
      return ensureBranchHead(octokit, { owner, repo, branch }, true);
    }
    if (error.status !== 404) throw error;

    // Branch does not exist yet: create it from the default branch.
    const { data: repository } = await octokit.rest.repos.get({ owner, repo });
    const { data: base } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${repository.default_branch}` });
    await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: base.object.sha });
    return base.object.sha;
  }
}

// Writes several files (content: string) and deletions (content: null) as ONE
// commit. `buildMessage(existingPaths)` receives the paths already in the repo
// so the caller can say "Add" or "Update". Unchanged files are skipped; if
// nothing changed, no commit is created.
export async function commitFiles(octokit, { owner, repo, branch, files, buildMessage }, attempt = 1) {
  const headSha = await ensureBranchHead(octokit, { owner, repo, branch });
  const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha });
  const { data: tree } = await octokit.rest.git.getTree({ owner, repo, tree_sha: headCommit.tree.sha, recursive: "true" });

  const existing = new Map(tree.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]));
  const entries = [];
  for (const { path, content } of files) {
    if (content === null) {
      if (existing.has(path)) entries.push({ path, mode: FILE_MODE, type: "blob", sha: null });
    } else if (existing.get(path) !== gitBlobSha(content)) {
      entries.push({ path, mode: FILE_MODE, type: "blob", content });
    }
  }

  const message = buildMessage(new Set(existing.keys()));
  if (entries.length === 0) {
    return { changed: false, commitSha: headSha, message, existingPaths: existing };
  }

  const { data: newTree } = await octokit.rest.git.createTree({ owner, repo, base_tree: headCommit.tree.sha, tree: entries });
  const { data: commit } = await octokit.rest.git.createCommit({ owner, repo, message, tree: newTree.sha, parents: [headSha] });

  try {
    await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false });
  } catch (error) {
    // Someone pushed in between: rebuild on top of the new head once.
    if (error.status === 422 && attempt < 3) {
      return commitFiles(octokit, { owner, repo, branch, files, buildMessage }, attempt + 1);
    }
    throw error;
  }

  return { changed: true, commitSha: commit.sha, commitUrl: commit.html_url, message, existingPaths: existing };
}
