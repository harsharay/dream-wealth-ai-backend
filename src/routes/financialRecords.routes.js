import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";
import {
    saveFinancialRecords,
    getFinancialRecords,
} from "../controllers/financialRecords.controller.js";

const router = Router();

router.post("/", authenticateUser, saveFinancialRecords);
router.get("/", authenticateUser, getFinancialRecords);

export default router;
