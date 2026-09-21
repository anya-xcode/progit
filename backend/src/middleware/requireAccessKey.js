import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

// Paths that must stay reachable without the key: the health probe (used by
// deploy checks) and the GitHub OAuth redirect, which arrives from GitHub and
// is protected by its own one-time `state`.
const OPEN_PATHS = new Set(["/health", "/github/oauth/callback"]);

function matches(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A single shared password for the whole app. Set APP_ACCESS_KEY when the app
// is reachable from the internet; without it the API is open (local use).
export function requireAccessKey(req, res, next) {
  if (!env.accessKey || OPEN_PATHS.has(req.path)) {
    next();
    return;
  }

  const provided = req.get("x-dsaforge-key") || req.query.key || "";
  if (provided && matches(provided, env.accessKey)) {
    next();
    return;
  }

  res.status(401).json({ message: "This DSAForge needs its access key.", code: "ACCESS_KEY_REQUIRED" });
}
