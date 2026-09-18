import { Router } from "express";
import { getSubmission, listSubmissions } from "../controllers/submissionController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();

router.get("/", listSubmissions);
router.get("/:id", validateObjectId("id"), getSubmission);

export default router;
