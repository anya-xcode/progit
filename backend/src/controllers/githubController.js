import { env } from "../config/env.js";
import Solution from "../models/Solution.js";
import {
  createRepository,
  disconnect,
  getStatus,
  listRepositories,
  listSyncHistory,
  selectRepository,
  updateSyncSettings,
} from "../services/github/connectionService.js";
import { buildAuthorizeUrl, completeOAuth } from "../services/github/oauthService.js";
import { queueSolutionSync, syncAllPending } from "../services/github/syncService.js";
import { notFound } from "../utils/httpError.js";

// GET /api/github/status?refresh=true
export async function status(req, res) {
  res.json(await getStatus({ refresh: req.query.refresh === "true" }));
}

// GET /api/github/repositories
export async function repositories(req, res) {
  res.json(await listRepositories());
}

// POST /api/github/repositories { name, isPrivate }
export async function createRepo(req, res) {
  res.status(201).json(await createRepository(req.body ?? {}));
}

// POST /api/github/select-repository { fullName, branch?, basePath? }
export async function selectRepo(req, res) {
  res.json(await selectRepository(req.body ?? {}));
}

// PUT /api/github/settings { autoSync?, branch?, basePath? }
export async function settings(req, res) {
  res.json(await updateSyncSettings(req.body ?? {}));
}

// POST /api/github/sync/:solutionId — manual sync or retry
export async function syncSolution(req, res) {
  const exists = await Solution.exists({ _id: req.params.solutionId });
  if (!exists) throw notFound("Solution not found");
  const [record] = await queueSolutionSync([req.params.solutionId]);
  res.status(202).json({ record, solution: await Solution.findById(req.params.solutionId) });
}

// POST /api/github/sync-all — every accepted approach that is not up to date
export async function syncAll(req, res) {
  const records = await syncAllPending();
  res.status(202).json({ queued: records.length });
}

// GET /api/github/syncs?limit=
export async function history(req, res) {
  res.json(await listSyncHistory({ limit: Number.parseInt(req.query.limit, 10) || 30 }));
}

// POST /api/github/disconnect
export async function disconnectGitHub(req, res) {
  res.json(await disconnect());
}

// GET /api/github/oauth/start — browser navigation, redirects to GitHub
export function oauthStart(req, res) {
  try {
    res.redirect(buildAuthorizeUrl());
  } catch (error) {
    res.redirect(`${env.clientUrl}/github?error=${encodeURIComponent(error.message)}`);
  }
}

// GET /api/github/oauth/callback — GitHub redirects back here
export async function oauthCallback(req, res) {
  try {
    if (req.query.error) throw new Error(req.query.error_description || req.query.error);
    await completeOAuth({ code: req.query.code, state: req.query.state });
    res.redirect(`${env.clientUrl}/github?connected=1`);
  } catch (error) {
    res.redirect(`${env.clientUrl}/github?error=${encodeURIComponent(error.message)}`);
  }
}
