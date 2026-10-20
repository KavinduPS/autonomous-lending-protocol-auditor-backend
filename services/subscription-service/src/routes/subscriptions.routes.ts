import { Router } from "express";
import {
  createSubscription,
  getSubscriptionById,
  getSubscriptionsByUserId,
  updateSubscriptionStatus,
  getCurrentSubscription,
  getSubscriptionEligibility,
  deleteSubscription,
} from "../controllers/subscription.controller";

const router = Router();

router.get("/user/:userId", getSubscriptionsByUserId);
router.get("/:id", getSubscriptionById);
router.post("/", createSubscription);
router.patch("/:id/status", updateSubscriptionStatus);
router.get("/user/:userId/current", getCurrentSubscription);
router.get("/user/:userId/eligibility", getSubscriptionEligibility);
router.delete("/:id", deleteSubscription);

export default router;
