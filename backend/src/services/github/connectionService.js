import { env } from "../../config/env.js";
import GitHubSync from "../../models/GitHubSync.js";
import Solution from "../../models/Solution.js";
import { badRequest } from "../../utils/httpError.js";
import { VERDICTS } from "../judge/verdicts.js";
import { createOctokit, describeGitHubError, getOctokit, getSettings, resolveAuth, toHttpError } from "./client.js";

const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH_PATTERN = /^(?!\/|.*\/\/|.*\.\.|.*\/$)[A-Za-z0-9._\/-]{1,100}$/;

export function sanitizeBasePath(value) {
  const path = String(value ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!path) return "";
  if (!/^[A-Za-z0-9._\/-]+$/.test(path) || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw badRequest("Folder may only contain letters, numbers, '.', '_', '-' and '/'");
  }
  return path;
}

function publicRepository(repo) {
  return {
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    htmlUrl: repo.html_url,
    isPrivate: repo.private,
    defaultBranch: repo.default_branch,
    description: repo.description ?? "",
    pushedAt: repo.pushed_at,
    canPush: repo.permissions ? Boolean(repo.permissions.push) : true,
  };
}

// After the target repository, branch or folder changes, previously synced
// files are not at the new location, so every approach needs a fresh sync.
async function resetSyncState() {
  await Solution.updateMany(
    { githubStatus: { $ne: "not-synced" } },
    { $set: { githubStatus: "not-synced", githubPath: "", githubCommitUrl: "", githubSyncError: "", githubSyncedAt: null } }
  );
}

function locationOf(settings) {
  return `${settings.repository?.fullName ?? ""}|${settings.branch ?? ""}|${settings.basePath ?? ""}`;
}

export function isReady(settings) {
  return Boolean(settings.repository?.fullName && settings.branch);
}

// Everything the UI needs. Never includes a token.
export async function getStatus({ refresh = false } = {}) {
  const [auth, settings] = await Promise.all([resolveAuth(), getSettings()]);
  const status = {
    configured: { token: Boolean(env.github.token), oauth: Boolean(env.github.clientId && env.github.clientSecret) },
    connected: false,
    authMethod: auth?.method ?? null,
    user: null,
    error: "",
    repository: settings.repository?.fullName ? settings.repository : null,
    branch: settings.branch,
    basePath: settings.basePath,
    autoSync: settings.autoSync,
    ready: false,
    counts: {},
  };

  if (auth) {
    if (!settings.user?.login || refresh) {
      try {
        const { data } = await createOctokit(auth.token).rest.users.getAuthenticated();
        settings.user = { login: data.login, name: data.name ?? "", avatarUrl: data.avatar_url, htmlUrl: data.html_url };
        await settings.save();
      } catch (error) {
        status.error = describeGitHubError(error);
      }
    }
    if (!status.error) {
      status.connected = true;
      status.user = settings.user;
    }
  }
  status.ready = status.connected && isReady(settings);

  const [byStatus, acceptedUnsynced] = await Promise.all([
    Solution.aggregate([{ $group: { _id: "$githubStatus", count: { $sum: 1 } } }]),
    Solution.countDocuments({ verdict: VERDICTS.ACCEPTED, githubStatus: { $in: ["not-synced", "outdated", "failed"] } }),
  ]);
  status.counts = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  status.counts.readyToSync = acceptedUnsynced;
  return status;
}

export async function listRepositories() {
  const { octokit } = await getOctokit();
  try {
    const repos = await octokit.paginate(
      octokit.rest.repos.listForAuthenticatedUser,
      { per_page: 100, sort: "pushed" },
      (response, done) => {
        // A few hundred repositories is plenty for a picker.
        if (response.data.length < 100) done();
        return response.data;
      }
    );
    return repos.slice(0, 500).map(publicRepository);
  } catch (error) {
    throw toHttpError(error);
  }
}

export async function createRepository({ name, isPrivate = true }) {
  if (!REPO_NAME_PATTERN.test(String(name ?? ""))) throw badRequest("Repository name may only contain letters, numbers, '.', '_' and '-'");
  const { octokit } = await getOctokit();
  try {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      private: Boolean(isPrivate),
      description: "DSA solutions — synced from DSAForge",
      auto_init: true,
    });
    return publicRepository(data);
  } catch (error) {
    if (error.status === 422) throw badRequest(`Could not create "${name}": ${error.response?.data?.errors?.[0]?.message ?? "name may already exist"}`);
    if (error.status === 403) throw badRequest("The token cannot create repositories. Create it on GitHub, or give the token Administration: Read and write.");
    throw toHttpError(error);
  }
}

export async function selectRepository({ fullName, branch, basePath }) {
  const [owner, name, extra] = String(fullName ?? "").split("/");
  if (!owner || !name || extra !== undefined) throw badRequest('Repository must look like "owner/name"');
  const cleanBranch = String(branch ?? "").trim();
  if (cleanBranch && !BRANCH_PATTERN.test(cleanBranch)) throw badRequest("Invalid branch name");

  const { octokit } = await getOctokit();
  let repo;
  try {
    ({ data: repo } = await octokit.rest.repos.get({ owner, repo: name }));
  } catch (error) {
    throw toHttpError(error);
  }
  if (repo.permissions && !repo.permissions.push) throw badRequest(`You do not have write access to ${repo.full_name}`);

  const settings = await getSettings();
  const previousLocation = locationOf(settings);
  const info = publicRepository(repo);
  settings.repository = {
    fullName: info.fullName,
    owner: info.owner,
    name: info.name,
    htmlUrl: info.htmlUrl,
    isPrivate: info.isPrivate,
    defaultBranch: info.defaultBranch || "main",
  };
  settings.branch = cleanBranch || info.defaultBranch || "main";
  settings.basePath = sanitizeBasePath(basePath);
  await settings.save();

  if (locationOf(settings) !== previousLocation) await resetSyncState();
  return getStatus();
}

export async function updateSyncSettings({ autoSync, branch, basePath }) {
  const settings = await getSettings();
  const previousLocation = locationOf(settings);
  if (typeof autoSync === "boolean") settings.autoSync = autoSync;
  if (branch !== undefined) {
    const clean = String(branch).trim();
    if (!BRANCH_PATTERN.test(clean)) throw badRequest("Invalid branch name");
    settings.branch = clean;
  }
  if (basePath !== undefined) settings.basePath = sanitizeBasePath(basePath);
  await settings.save();

  if (locationOf(settings) !== previousLocation) await resetSyncState();
  return getStatus();
}

// Forget the OAuth token and repository choice. A GITHUB_TOKEN in .env stays
// active until it is removed from the file.
export async function disconnect() {
  const settings = await getSettings({ withToken: true });
  settings.oauthToken = "";
  settings.user = { login: "", name: "", avatarUrl: "", htmlUrl: "" };
  await settings.save();
  return getStatus();
}

export async function listSyncHistory({ limit = 30 } = {}) {
  return GitHubSync.find().sort({ createdAt: -1 }).limit(Math.min(Math.max(limit, 1), 100)).lean();
}
