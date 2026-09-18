import { getProgress, getRecent, getStats } from "../services/dashboardService.js";

export async function stats(req, res) {
  res.json(await getStats());
}

export async function progress(req, res) {
  const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 182, 7), 366);
  res.json(await getProgress({ activityDays: days }));
}

export async function recent(req, res) {
  res.json(await getRecent());
}
