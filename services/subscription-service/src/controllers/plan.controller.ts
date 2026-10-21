import type { Request, Response } from "express";
import { planService } from "../services/plan.service.js";

function serialize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }

  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parsePriceMinor(value: unknown): bigint | null {
  try {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    ) {
      return null;
    }

    if (typeof value === "string" && value.trim() === "") {
      return null;
    }

    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      return null;
    }

    const parsedValue = BigInt(value);

    return parsedValue >= 0n ? parsedValue : null;
  } catch {
    return null;
  }
}

/**
 * GET /plans
 */
export async function getPlans(_req: Request, res: Response) {
  try {
    const plans = await planService.findAll();

    return res.status(200).json(serialize(plans));
  } catch (error) {
    console.error("Failed to get plans:", error);

    return res.status(500).json({
      message: "Failed to get plans",
    });
  }
}

/**
 * GET /plans/:id
 */
export async function getPlanById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isNonEmptyString(id)) {
      return res.status(400).json({
        message: "A valid plan ID is required",
      });
    }

    const plan = await planService.findById(id.trim());

    if (!plan) {
      return res.status(404).json({
        message: "Plan not found",
      });
    }

    return res.status(200).json(serialize(plan));
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2023") {
      return res.status(400).json({
        message: "Invalid plan ID",
      });
    }

    console.error("Failed to get plan:", error);

    return res.status(500).json({
      message: "Failed to get plan",
    });
  }
}

/**
 * POST /plans
 *
 * You probably will NOT expose this publicly because
 * FREE/BASIC/PRO are now created using the seed file.
 */
export async function createPlan(req: Request, res: Response) {
  try {
    const {
      code,
      stripePriceId,
      priceMinor,
      currency,
      creditsPerPeriod,
      exploitSimulation,
      extraCreditsAllowed,
      maxConcurrentAudits,
      queuePriority,
      apiAccess,
      isActive,
    } = req.body;

    const parsedPriceMinor = parsePriceMinor(priceMinor);

    if (
      !isNonEmptyString(code) ||
      parsedPriceMinor === null ||
      !isNonEmptyString(currency) ||
      !Number.isInteger(creditsPerPeriod) ||
      creditsPerPeriod < 0 ||
      typeof exploitSimulation !== "boolean" ||
      typeof extraCreditsAllowed !== "boolean" ||
      !Number.isInteger(maxConcurrentAudits) ||
      maxConcurrentAudits < 1 ||
      !isNonEmptyString(queuePriority) ||
      typeof apiAccess !== "boolean" ||
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        message: "Invalid plan data",
      });
    }

    const normalizedStripePriceId = isNonEmptyString(stripePriceId)
      ? stripePriceId.trim()
      : null;

    const plan = await planService.create({
      code: code.trim().toUpperCase(),

      stripePriceId: normalizedStripePriceId,

      priceMinor: parsedPriceMinor,

      currency: currency.trim().toLowerCase(),

      creditsPerPeriod,

      exploitSimulation,
      extraCreditsAllowed,
      maxConcurrentAudits,

      queuePriority: queuePriority.trim().toUpperCase(),

      apiAccess,
      isActive,
    });

    return res.status(201).json(serialize(plan));
  } catch (error) {
    if (getPrismaErrorCode(error) === "P2002") {
      return res.status(409).json({
        message: "A plan with this code or Stripe price ID already exists",
      });
    }

    console.error("Failed to create plan:", error);

    return res.status(500).json({
      message: "Failed to create plan",
    });
  }
}

/**
 * PATCH /plans/:id
 */
export async function updatePlan(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isNonEmptyString(id)) {
      return res.status(400).json({
        message: "A valid plan ID is required",
      });
    }

    const {
      code,
      stripePriceId,
      priceMinor,
      currency,
      creditsPerPeriod,
      exploitSimulation,
      extraCreditsAllowed,
      maxConcurrentAudits,
      queuePriority,
      apiAccess,
      isActive,
    } = req.body;

    const data: {
      code?: string;
      stripePriceId?: string | null;
      priceMinor?: bigint;
      currency?: string;
      creditsPerPeriod?: number;
      exploitSimulation?: boolean;
      extraCreditsAllowed?: boolean;
      maxConcurrentAudits?: number;
      queuePriority?: string;
      apiAccess?: boolean;
      isActive?: boolean;
    } = {};

    if (code !== undefined) {
      if (!isNonEmptyString(code)) {
        return res.status(400).json({
          message: "Invalid plan code",
        });
      }

      data.code = code.trim().toUpperCase();
    }

    if (stripePriceId !== undefined) {
      if (stripePriceId === null) {
        data.stripePriceId = null;
      } else if (isNonEmptyString(stripePriceId)) {
        data.stripePriceId = stripePriceId.trim();
      } else {
        return res.status(400).json({
          message: "Invalid Stripe price ID",
        });
      }
    }

    if (priceMinor !== undefined) {
      const parsedPriceMinor = parsePriceMinor(priceMinor);

      if (parsedPriceMinor === null) {
        return res.status(400).json({
          message: "Invalid price",
        });
      }

      data.priceMinor = parsedPriceMinor;
    }

    if (currency !== undefined) {
      if (!isNonEmptyString(currency)) {
        return res.status(400).json({
          message: "Invalid currency",
        });
      }

      data.currency = currency.trim().toLowerCase();
    }

    if (creditsPerPeriod !== undefined) {
      if (!Number.isInteger(creditsPerPeriod) || creditsPerPeriod < 0) {
        return res.status(400).json({
          message: "Invalid credits per period",
        });
      }

      data.creditsPerPeriod = creditsPerPeriod;
    }

    if (exploitSimulation !== undefined) {
      if (typeof exploitSimulation !== "boolean") {
        return res.status(400).json({
          message: "Invalid exploit simulation value",
        });
      }

      data.exploitSimulation = exploitSimulation;
    }

    if (extraCreditsAllowed !== undefined) {
      if (typeof extraCreditsAllowed !== "boolean") {
        return res.status(400).json({
          message: "Invalid extra credits value",
        });
      }

      data.extraCreditsAllowed = extraCreditsAllowed;
    }

    if (maxConcurrentAudits !== undefined) {
      if (!Number.isInteger(maxConcurrentAudits) || maxConcurrentAudits < 1) {
        return res.status(400).json({
          message: "Invalid concurrent audit limit",
        });
      }

      data.maxConcurrentAudits = maxConcurrentAudits;
    }

    if (queuePriority !== undefined) {
      if (!isNonEmptyString(queuePriority)) {
        return res.status(400).json({
          message: "Invalid queue priority",
        });
      }

      data.queuePriority = queuePriority.trim().toUpperCase();
    }

    if (apiAccess !== undefined) {
      if (typeof apiAccess !== "boolean") {
        return res.status(400).json({
          message: "Invalid API access value",
        });
      }

      data.apiAccess = apiAccess;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: "Invalid active value",
        });
      }

      data.isActive = isActive;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        message: "No valid fields were provided",
      });
    }

    const plan = await planService.update(id.trim(), data);

    return res.status(200).json(serialize(plan));
  } catch (error) {
    const errorCode = getPrismaErrorCode(error);

    if (errorCode === "P2025") {
      return res.status(404).json({
        message: "Plan not found",
      });
    }

    if (errorCode === "P2002") {
      return res.status(409).json({
        message: "Plan code or Stripe price ID already exists",
      });
    }

    if (errorCode === "P2023") {
      return res.status(400).json({
        message: "Invalid plan ID",
      });
    }

    console.error("Failed to update plan:", error);

    return res.status(500).json({
      message: "Failed to update plan",
    });
  }
}

/**
 * DELETE /plans/:id
 */
export async function deletePlan(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!isNonEmptyString(id)) {
      return res.status(400).json({
        message: "A valid plan ID is required",
      });
    }

    await planService.remove(id.trim());

    return res.status(204).send();
  } catch (error) {
    const errorCode = getPrismaErrorCode(error);

    if (errorCode === "P2025") {
      return res.status(404).json({
        message: "Plan not found",
      });
    }

    if (errorCode === "P2003") {
      return res.status(409).json({
        message: "Cannot delete a plan that is used by subscriptions",
      });
    }

    if (errorCode === "P2023") {
      return res.status(400).json({
        message: "Invalid plan ID",
      });
    }

    console.error("Failed to delete plan:", error);

    return res.status(500).json({
      message: "Failed to delete plan",
    });
  }
}
