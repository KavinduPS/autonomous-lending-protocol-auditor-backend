import { prisma } from "../config/database.js";
import { stripe } from "../config/stripe.js";

async function createCheckoutSession(planCode: string, userId: string) {
  const normalizedPlanCode = planCode.trim().toUpperCase();

  const plan = await prisma.plan.findUnique({
    where: {
      code: normalizedPlanCode,
    },
  });

  if (!plan) {
    throw new Error("PLAN_NOT_FOUND");
  }

  if (!plan.isActive) {
    throw new Error("PLAN_INACTIVE");
  }

  if (plan.code === "FREE") {
    throw new Error("FREE_PLAN_DOES_NOT_REQUIRE_STRIPE");
  }

  if (!plan.stripePriceId) {
    throw new Error("STRIPE_PRICE_NOT_CONFIGURED");
  }

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",

    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],

    success_url: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,

    cancel_url: `${frontendUrl}/subscription/cancel`,

    client_reference_id: userId,

    metadata: {
      userId,
      planId: plan.id,
      planCode: plan.code,
    },

    subscription_data: {
      metadata: {
        userId,
        planId: plan.id,
        planCode: plan.code,
      },
    },
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,

    plan: {
      id: plan.id,
      code: plan.code,
      priceMinor: plan.priceMinor,
      currency: plan.currency,
      creditsPerPeriod: plan.creditsPerPeriod,
    },
  };
}

export const stripeService = {
  createCheckoutSession,
};
