import { Router } from "express";
import {
  createSolution,
  deleteSolution,
  listAllSolutions,
  listProblemSolutions,
  updateSolution,
} from "../controllers/solutionController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();

router.get("/", listAllSolutions);
router.get("/:problemId", validateObjectId("problemId"), listProblemSolutions);
router.post("/", createSolution);
router.put("/:id", validateObjectId("id"), updateSolution);
router.delete("/:id", validateObjectId("id"), deleteSolution);

export default router;
