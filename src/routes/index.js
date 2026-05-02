import { Router } from "express";
import { verifyRateLimit } from "../middleware/rateLimit.js";
import financialRecordsRoutes from "./financialRecords.routes.js";
import insightsRoutes from "./insights.routes.js";
import simulatorRoutes from "./simulator.routes.js";

const router = Router();

router.use(verifyRateLimit);

router.use("/financial-records", financialRecordsRoutes);
router.use("/insights", insightsRoutes);
router.use("/simulator", simulatorRoutes);

export default router;
