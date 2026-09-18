import { Router } from "express";
import { checkSandbox, getCodeInfo, runCode, submitCode } from "../controllers/codeController.js";

const router = Router();

router.post("/run", runCode);
router.post("/submit", submitCode);
router.get("/info", getCodeInfo);
router.post("/health", checkSandbox);

export default router;
