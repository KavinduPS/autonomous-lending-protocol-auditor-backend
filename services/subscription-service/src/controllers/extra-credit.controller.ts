import type { Request, Response } from "express";

import { extraCreditService } from "../services/extra-credit.service.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function serialize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

/*
 * GET /extra-credits/packs
 */
export async function getCreditPacks(_req: Request, res: Response) {
  try {
    const packs = await extraCreditService.findActivePacks();

    return res.status(200).json(serialize(packs));
  } catch (error) {
    console.error("Failed to get credit packs:", error);

    return res.status(500).json({
      message: "Failed to retrieve credit packs",
    });
  }
}

/*
 * POST /extra-credits/checkout-session
 */
export async function createExtraCreditCheckout(req: Request, res: Response) {
  try {
    const { userId, packCode } = req.body;

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        message: "A valid user ID is required",
      });
    }

    if (!isNonEmptyString(packCode)) {
      return res.status(400).json({
        message: "A valid credit pack code is required",
      });
    }

    const result = await extraCreditService.createCheckoutSession(
      userId.trim(),
      packCode.trim(),
    );

    return res.status(201).json(serialize(result));
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "ACTIVE_SUBSCRIPTION_REQUIRED":
          return res.status(403).json({
            message:
              "An active subscription is required to purchase extra credits",
          });

        case "EXTRA_CREDITS_NOT_ALLOWED":
          return res.status(403).json({
            message:
              "Your subscription plan does not allow extra-credit purchases",
          });

        case "CREDIT_PACK_NOT_FOUND":
          return res.status(404).json({
            message: "Credit pack not found",
          });

        case "CREDIT_PACK_INACTIVE":
          return res.status(400).json({
            message: "This credit pack is not active",
          });

        case "STRIPE_PRICE_NOT_CONFIGURED":
          return res.status(500).json({
            message: "Stripe Price ID is not configured for this credit pack",
          });
      }
    }

    console.error("Failed to create extra-credit checkout:", error);

    return res.status(500).json({
      message: "Failed to create extra-credit checkout session",
    });
  }
}

/*
 * GET /extra-credits/user/:userId/balance
 */
export async function getCreditBalance(req: Request, res: Response) {
  try {
    const userId = req.params.userId;

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        message: "A valid user ID is required",
      });
    }

    const balance = await extraCreditService.getBalanceByUserId(userId.trim());

    if (!balance) {
      return res.status(200).json({
        userId: userId.trim(),
        planCredits: 0,
        extraCredits: 0,
        totalCredits: 0,
      });
    }

    return res.status(200).json({
      ...serialize(balance),

      totalCredits: balance.planCredits + balance.extraCredits,
    });
  } catch (error) {
    console.error("Failed to get credit balance:", error);

    return res.status(500).json({
      message: "Failed to retrieve credit balance",
    });
  }
}

/*
 * GET /extra-credits/user/:userId/purchases
 */
export async function getExtraCreditPurchases(req: Request, res: Response) {
  try {
    const userId = req.params.userId;

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        message: "A valid user ID is required",
      });
    }

    const purchases = await extraCreditService.findPurchasesByUserId(
      userId.trim(),
    );

    return res.status(200).json(serialize(purchases));
  } catch (error) {
    console.error("Failed to get extra-credit purchases:", error);

    return res.status(500).json({
      message: "Failed to retrieve extra-credit purchases",
    });
  }
}
