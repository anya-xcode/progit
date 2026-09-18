import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { badRequest } from "../../utils/httpError.js";
import { createOctokit, getSettings } from "./client.js";

// One-time `state` values protect the callback against CSRF.
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

export function isOAuthConfigured() {
  return Boolean(env.github.clientId && env.github.clientSecret);
}

export function buildAuthorizeUrl() {
  if (!isOAuthConfigured()) throw badRequest("Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env first.");

  const now = Date.now();
  for (const [value, expires] of pendingStates) if (expires < now) pendingStates.delete(value);
  const state = randomBytes(24).toString("hex");
  pendingStates.set(state, now + STATE_TTL_MS);

  const params = new URLSearchParams({
    client_id: env.github.clientId,
    redirect_uri: env.github.oauthCallbackUrl,
    scope: "repo",
    state,
    allow_signup: "false",
  });
  return `${env.github.webUrl}/login/oauth/authorize?${params}`;
}

export async function completeOAuth({ code, state }) {
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  if (!state || !expires || expires < Date.now()) throw badRequest("GitHub sign-in expired or was not started here. Try again.");
  if (!code) throw badRequest("GitHub did not return an authorization code.");

  const response = await fetch(`${env.github.webUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.github.clientId,
      client_secret: env.github.clientSecret,
      code,
      redirect_uri: env.github.oauthCallbackUrl,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw badRequest(`GitHub sign-in failed: ${data.error_description || data.error || response.statusText}`);
  }

  const { data: user } = await createOctokit(data.access_token).rest.users.getAuthenticated();
  const settings = await getSettings({ withToken: true });
  settings.oauthToken = data.access_token;
  settings.user = { login: user.login, name: user.name ?? "", avatarUrl: user.avatar_url, htmlUrl: user.html_url };
  await settings.save();
  return settings.user;
}
