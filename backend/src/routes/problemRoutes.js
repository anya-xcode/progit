import { Router } from "express";
import {
  createProblem,
  deleteProblem,
  getProblem,
  getProblemMeta,
  listProblems,
  setProblemDone,
  updateProblem,
} from "../controllers/problemController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();

router.get("/", listProblems);
router.get("/meta", getProblemMeta);
router.get("/:slug", getProblem);
router.post("/", createProblem);
router.put("/:id/done", validateObjectId("id"), setProblemDone);
router.put("/:id", validateObjectId("id"), updateProblem);
router.delete("/:id", validateObjectId("id"), deleteProblem);

export default router;
