import { Router } from "express";
import {
  createRepo,
  disconnectGitHub,
  history,
  oauthCallback,
  oauthStart,
  repositories,
  selectRepo,
  settings,
  status,
  syncAll,
  syncSolution,
} from "../controllers/githubController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();

router.get("/status", status);
router.get("/repositories", repositories);
router.post("/repositories", createRepo);
router.post("/select-repository", selectRepo);
router.put("/settings", settings);
router.post("/sync-all", syncAll);
router.post("/sync/:solutionId", validateObjectId("solutionId"), syncSolution);
router.get("/syncs", history);
router.post("/disconnect", disconnectGitHub);
router.get("/oauth/start", oauthStart);
router.get("/oauth/callback", oauthCallback);

export default router;
