import { Octokit } from "@octokit/rest";
import { env } from "../../config/env.js";
import GitHubSettings from "../../models/GitHubSettings.js";
import { HttpError } from "../../utils/httpError.js";

const REQUEST_TIMEOUT_MS = 30_000;

export async function getSettings({ withToken = false } = {}) {
  // Atomic upsert: parallel first calls must not both try to create the document.
  const query = GitHubSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  if (withToken) query.select("+oauthToken");
  return query;
}

// OAuth token (stored server-side after "Connect with GitHub") wins over the
// GITHUB_TOKEN from .env. Returns null when GitHub is not configured.
export async function resolveAuth() {
  const settings = await getSettings({ withToken: true });
  if (settings.oauthToken) return { token: settings.oauthToken, method: "oauth" };
  if (env.github.token) return { token: env.github.token, method: "token" };
  return null;
}

export function createOctokit(token) {
  return new Octokit({
    auth: token,
    baseUrl: env.github.apiUrl,
    userAgent: "DSAForge",
    request: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });
}

export async function getOctokit() {
  const auth = await resolveAuth();
  if (!auth) throw new HttpError(409, "GitHub is not connected. Add GITHUB_TOKEN to backend/.env or connect with GitHub.");
  return { octokit: createOctokit(auth.token), method: auth.method };
}

// Turns Octokit/network errors into messages that say what to fix.
export function describeGitHubError(error) {
  if (error instanceof HttpError) return error.message;
  const status = error.status;
  const apiMessage = error.response?.data?.message;

  if (error.name === "TimeoutError" || error.name === "AbortError") return "GitHub did not respond in time. Try again.";
  if (status === 401) return "GitHub rejected the token (invalid or expired). Update GITHUB_TOKEN or reconnect.";
  if (status === 403) {
    if (error.response?.headers?.["x-ratelimit-remaining"] === "0") return "GitHub API rate limit reached. Try again later.";
    return `GitHub denied access${apiMessage ? `: ${apiMessage}` : ""}. The token needs Contents: Read and write on this repository.`;
  }
  if (status === 404) return "Repository or branch not found, or the token cannot access it.";
  if (status === 409) return `GitHub reported a conflict${apiMessage ? `: ${apiMessage}` : ""}.`;
  if (status === 422) return `GitHub rejected the request${apiMessage ? `: ${apiMessage}` : ""}.`;
  if (!status) return `Could not reach GitHub: ${error.message}`;
  return `GitHub error ${status}${apiMessage ? `: ${apiMessage}` : ""}`;
}

export function toHttpError(error) {
  if (error instanceof HttpError) return error;
  const status = [401, 403, 404, 422].includes(error.status) ? 400 : 502;
  return new HttpError(status, describeGitHubError(error));
}
