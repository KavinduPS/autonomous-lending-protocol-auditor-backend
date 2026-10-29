import { Router } from "express";
import { internalAuth } from "../middleware/internalAuth.js";
import {
  postComplete,
  postCreateAudit,
  postRag,
  postSimulation,
  postStatic,
  postTriage,
} from "../controllers/ingest.controller.js";

const router = Router();

router.use(internalAuth);

router.post("/audits", postCreateAudit);
router.post("/audits/:auditId/static", postStatic);
router.post("/audits/:auditId/rag", postRag);
router.post("/audits/:auditId/triage", postTriage);
router.post("/audits/:auditId/simulation", postSimulation);
router.post("/audits/:auditId/complete", postComplete);

export default router;
