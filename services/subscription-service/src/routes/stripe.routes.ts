import { Router } from "express";

import { stripeSubscription } from "../controllers/stripe.controller.js";

const router = Router();

router.post("/checkout-session", stripeSubscription);

export default router;
