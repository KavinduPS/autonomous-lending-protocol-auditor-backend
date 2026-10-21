import type { Request, Response } from "express";
import { subscriptionService } from "../services/subscription.service.js";

/**
 * Converts values such as Prisma BigInt into JSON-safe values.
 */
function serialize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

/**
 * Extract Prisma error code safely.
 */
function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }

  return undefined;
}

/**
 * Check whether a value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Parse ISO date string.
 */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

/**
 * GET /subscriptions/:id
 *
 * Get one subscription using its subscription ID.
 */
export async function getSubscriptionById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isNonEmptyString(id)) {
      return res.status(400).json({
        message: "A valid subscription ID is required",
      });
    }

    const subscription = await subscriptionService.findById(id.trim());

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription not found",
      });
    }

    return res.status(200).json(serialize(subscription));
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2023") {
      return res.status(400).json({
        message: "Invalid subscription ID",
      });
    }

    console.error("Failed to get subscription:", error);

    return res.status(500).json({
      message: "Failed to get subscription",
    });
  }
}

/**
 * GET /subscriptions/user/:userId
 *
 * Return subscription history for a user.
 */
export async function getSubscriptionsByUserId(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        message: "A valid user ID is required",
      });
    }

    const subscriptions = await subscriptionService.findByUserId(userId.trim());

    return res.status(200).json(serialize(subscriptions));
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2023") {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    console.error("Failed to get user subscriptions:", error);

    return res.status(500).json({
      message: "Failed to get user subscriptions",
    });
  }
}

/**
 * GET /subscriptions/user/:userId/current
 *
 * Get the user's current subscription.
 */
export async function getCurrentSubscription(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        message: "A valid user ID is required",
      });
    }

    const subscription = await subscriptionService.findCurrentByUserId(
      userId.trim(),
    );

    if (!subscription) {
      return res.status(404).json({
        message: "Current subscription not found",
      });
    }

    return res.status(200).json(serialize(subscription));
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2023") {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    console.error("Failed to get current subscription:", error);

    return res.status(500).json({
      message: "Failed to get current subscription",
    });
  }
}

/**
 * POST /subscriptions
 *
 * Create a subscription.
 *
 * Stripe IDs are optional because the FREE plan does not require Stripe.
 */
export async function createSubscription(req: Request, res: Response) {
  try {
    const {
      userId,
      planId,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodEnd,
    } = req.body;

    const parsedCurrentPeriodEnd = parseDate(currentPeriodEnd);

    if (
      !isNonEmptyString(userId) ||
      !isNonEmptyString(planId) ||
      !isNonEmptyString(status) ||
      parsedCurrentPeriodEnd === null
    ) {
      return res.status(400).json({
        message: "Invalid subscription data",
      });
    }

    const normalizedStripeCustomerId = isNonEmptyString(stripeCustomerId)
      ? stripeCustomerId.trim()
      : null;

    const normalizedStripeSubscriptionId = isNonEmptyString(
      stripeSubscriptionId,
    )
      ? stripeSubscriptionId.trim()
      : null;

    const subscription = await subscriptionService.create({
      userId: userId.trim(),
      planId: planId.trim(),
      status: status.trim().toLowerCase(),
      stripeCustomerId: normalizedStripeCustomerId,
      stripeSubscriptionId: normalizedStripeSubscriptionId,
      currentPeriodEnd: parsedCurrentPeriodEnd,
    });

    return res.status(201).json(serialize(subscription));
  } catch (error) {
    const errorCode = getPrismaErrorCode(error);

    if (errorCode === "P2002") {
      return res.status(409).json({
        message: "Stripe subscription ID already exists",
      });
    }

    if (errorCode === "P2003") {
      return res.status(400).json({
        message: "The selected plan does not exist",
      });
    }

    if (errorCode === "P2023") {
      return res.status(400).json({
        message: "Invalid user ID or plan ID",
      });
    }

    console.error("Failed to create subscription:", error);

    return res.status(500).json({
      message: "Failed to create subscription",
    });
  }
}

/**
 * PATCH /subscriptions/:id/status
 *
 * Update subscription status and optionally the current period end.
 */
export async function updateSubscriptionStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, currentPeriodEnd } = req.body;

    if (!isNonEmptyString(id)) {
      return res.status(400).json({
        message: "A valid subscription ID is required",
      });
    }

    if (!isNonEmptyString(status)) {
      return res.status(400).json({
        message: "A valid subscription status is required",
      });
    }

    let parsedCurrentPeriodEnd: Date | undefined;

    if (currentPeriodEnd !== undefined) {
      const parsedDate = parseDate(currentPeriodEnd);

      if (parsedDate === null) {
        return res.status(400).json({
          message: "Invalid current period end date",
        });
      }

      parsedCurrentPeriodEnd = parsedDate;
    }

    const subscription = await subscriptionService.updateStatus(id.trim(), {
      status: status.trim().toLowerCase(),
      currentPeriodEnd: parsedCurrentPeriodEnd,
    });

    return res.status(200).json(serialize(subscription));
  } catch (error) {
    const errorCode = getPrismaErrorCode(error);

    if (errorCode === "P2025") {
      return res.status(404).json({
        message: "Subscription not found",
      });
    }

    if (errorCode === "P2023") {
      return res.status(400).json({
        message: "Invalid subscription ID",
      });
    }

    console.error("Failed to update subscription:", error);

    return res.status(500).json({
      message: "Failed to update subscription",
    });
  }
}

/**
 * GET /subscriptions/user/:userId/eligibility
 *
 * Check whether the user's subscription is currently eligible.
 *
 * Credit balance checking will be added later when the credit module
 * is implemented.
 */
export async function getSubscriptionEligibility(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    if (!isNonEmptyString(userId)) {
      return res.status(400).json({
        eligible: false,
        reason: "INVALID_USER_ID",
        message: "A valid user ID is required",
      });
    }

    const subscription = await subscriptionService.findCurrentByUserId(
      userId.trim(),
    );

    if (!subscription) {
      return res.status(200).json({
        eligible: false,
        reason: "NO_SUBSCRIPTION",
        message: "The user does not have a current subscription",
      });
    }

    const eligibleStatuses = new Set(["active", "trialing"]);

    const normalizedStatus = subscription.status.toLowerCase();

    if (!eligibleStatuses.has(normalizedStatus)) {
      return res.status(200).json({
        eligible: false,
        reason: "INACTIVE_SUBSCRIPTION",
        message: `Subscription status is ${subscription.status}`,
        subscriptionId: subscription.id,
        status: subscription.status,
      });
    }

    if (!subscription.plan.isActive) {
      return res.status(200).json({
        eligible: false,
        reason: "PLAN_INACTIVE",
        message: "The subscription plan is currently inactive",
        subscriptionId: subscription.id,
        status: subscription.status,
        plan: subscription.plan.code,
      });
    }

    if (!subscription.currentPeriodEnd) {
      return res.status(200).json({
        eligible: false,
        reason: "MISSING_PERIOD_END",
        message: "The subscription does not have a period end date",
        subscriptionId: subscription.id,
        status: subscription.status,
      });
    }

    const currentPeriodEnd = subscription.currentPeriodEnd;

    const expired = currentPeriodEnd.getTime() <= Date.now();

    if (expired) {
      return res.status(200).json(
        serialize({
          eligible: false,
          reason: "SUBSCRIPTION_EXPIRED",
          message: "The subscription period has expired",
          subscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd,
        }),
      );
    }

    return res.status(200).json(
      serialize({
        eligible: true,
        reason: null,
        message: "The user has an eligible subscription",

        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd,

        plan: {
          id: subscription.plan.id,
          code: subscription.plan.code,
          priceMinor: subscription.plan.priceMinor,
          currency: subscription.plan.currency,

          creditsPerPeriod: subscription.plan.creditsPerPeriod,

          exploitSimulation: subscription.plan.exploitSimulation,

          extraCreditsAllowed: subscription.plan.extraCreditsAllowed,

          maxConcurrentAudits: subscription.plan.maxConcurrentAudits,

          queuePriority: subscription.plan.queuePriority,

          apiAccess: subscription.plan.apiAccess,

          isActive: subscription.plan.isActive,
        },
      }),
    );
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2023") {
      return res.status(400).json({
        eligible: false,
        reason: "INVALID_USER_ID",
        message: "The user ID is not a valid UUID",
      });
    }

    console.error("Failed to check subscription eligibility:", error);

    return res.status(500).json({
      eligible: false,
      reason: "INTERNAL_ERROR",
      message: "Failed to check subscription eligibility",
    });
  }
}

export async function deleteSubscription(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isNonEmptyString(id)) {
      return res.status(400).json({
        message: "A valid subscription ID is required",
      });
    }

    await subscriptionService.remove(id.trim());

    return res.status(204).send();
  } catch (error) {
    const errorCode = getPrismaErrorCode(error);

    if (errorCode === "P2025") {
      return res.status(404).json({
        message: "Subscription not found",
      });
    }

    if (errorCode === "P2023") {
      return res.status(400).json({
        message: "Invalid subscription ID",
      });
    }

    if (errorCode === "P2003") {
      return res.status(409).json({
        message:
          "Cannot delete this subscription because related records exist",
      });
    }

    console.error("Failed to delete subscription:", error);

    return res.status(500).json({
      message: "Failed to delete subscription",
    });
  }
}
