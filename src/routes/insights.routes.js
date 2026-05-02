import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";
import { generateInsights, getInsightsHistory } from "../controllers/insights.controller.js";

const router = Router();

router.post("/", authenticateUser, generateInsights);
router.get("/history", authenticateUser, getInsightsHistory);

export default router;
