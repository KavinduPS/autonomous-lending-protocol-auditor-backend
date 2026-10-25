import { Router } from "express";
import { getReport } from "../controllers/report.controller.js";

const router = Router();

router.get("/:auditId", getReport);

export default router;
