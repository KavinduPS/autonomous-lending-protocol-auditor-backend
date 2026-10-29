import { Router } from "express";
import {
  getAttemptRun,
  getBaselineRun,
  getComparison,
  getFinding,
  getReport,
  getSeverityLevels,
  listReports,
} from "../controllers/report.controller.js";
import { userContext } from "../middleware/userContext.js";

const router = Router();

router.use(userContext);

router.get("/", listReports);
router.get("/meta/severity-levels", getSeverityLevels); // before /:auditId
router.get("/:auditId", getReport);
router.get("/:auditId/comparison", getComparison);
router.get("/:auditId/findings/:findingId", getFinding);
router.get("/:auditId/simulations/baseline", getBaselineRun); // before :attemptId
router.get("/:auditId/simulations/:attemptId", getAttemptRun);

export default router;
