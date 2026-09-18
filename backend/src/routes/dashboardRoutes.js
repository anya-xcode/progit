import { Router } from "express";
import { progress, recent, stats } from "../controllers/dashboardController.js";

const router = Router();

router.get("/stats", stats);
router.get("/progress", progress);
router.get("/recent", recent);

export default router;
