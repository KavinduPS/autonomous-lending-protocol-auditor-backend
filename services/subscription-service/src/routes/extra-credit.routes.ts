import { Router } from "express";

import {
  createExtraCreditCheckout,
  getCreditBalance,
  getCreditPacks,
  getExtraCreditPurchases,
} from "../controllers/extra-credit.controller.js";

const router = Router();

router.get("/packs", getCreditPacks);
router.post("/checkout-session", createExtraCreditCheckout);
router.get("/user/:userId/balance", getCreditBalance);
router.get("/user/:userId/purchases", getExtraCreditPurchases);

export default router;
