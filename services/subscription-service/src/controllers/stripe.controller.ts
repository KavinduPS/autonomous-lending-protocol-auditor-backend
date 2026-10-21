import type { Request, Response } from "express";
import { stripeService } from "../services/stripe.service.js";

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

export async function stripeSubscription(req: Request, res: Response) {
  try {
    const { planCode, userId } = req.body;

    if (!isNonEmptyString(planCode)) {
      return res.status(400).json({
        message: "A valid plan code is required",
      });
    }

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        message: "A valid user ID is required",
      });
    }

    const result = await stripeService.createCheckoutSession(planCode, userId);

    return res.status(201).json(serialize(result));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PLAN_NOT_FOUND") {
        return res.status(404).json({
          message: "Subscription plan not found",
        });
      }

      if (error.message === "PLAN_INACTIVE") {
        return res.status(400).json({
          message: "This subscription plan is not active",
        });
      }

      if (error.message === "FREE_PLAN_DOES_NOT_REQUIRE_STRIPE") {
        return res.status(400).json({
          message: "The FREE plan does not require Stripe checkout",
        });
      }

      if (error.message === "STRIPE_PRICE_NOT_CONFIGURED") {
        return res.status(500).json({
          message: "Stripe Price ID is not configured for this plan",
        });
      }
    }

    console.error("Failed to create Stripe checkout session:", error);

    return res.status(500).json({
      message: "Failed to create Stripe checkout session",
    });
  }
}
