import { Router } from "express";
import {
  createPlan,
  deletePlan,
  getPlanById,
  getPlans,
  updatePlan,
} from "../controllers/plan.controller.js";

const router = Router();

router.get("/", getPlans);
router.get("/:id", getPlanById);
// router.post("/", createPlan);
// router.patch("/:id", updatePlan);
// router.delete("/:id", deletePlan);

export default router;
