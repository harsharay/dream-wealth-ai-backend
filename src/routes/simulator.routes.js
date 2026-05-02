import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";
import {
    generateQuestions,
    generateNextQuestions,
    getSimulatorState,
    saveSimulatorState,
    checkEligibility,
    rateQuestion,
    recommend,
} from "../controllers/simulator.controller.js";
import {
    createTracking,
    listTracking,
    updateTracking,
} from "../controllers/actionTracking.controller.js";

const router = Router();

router.post("/questions", authenticateUser, generateQuestions);
router.post("/questions/next", authenticateUser, generateNextQuestions);
router.get("/state", authenticateUser, getSimulatorState);
router.post("/state", authenticateUser, saveSimulatorState);
router.get("/eligibility", authenticateUser, checkEligibility);
router.post("/rate", authenticateUser, rateQuestion);
router.post("/recommend", authenticateUser, recommend);

router.post("/track", authenticateUser, createTracking);
router.get("/track", authenticateUser, listTracking);
router.put("/track/:id", authenticateUser, updateTracking);

export default router;
