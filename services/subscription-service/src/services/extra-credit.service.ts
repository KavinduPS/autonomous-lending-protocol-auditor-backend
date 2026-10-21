import { prisma } from "../config/database.js";
import { stripe } from "../config/stripe.js";
import { subscriptionService } from "./subscription.service.js";

async function createCheckoutSession(userId: string, packCode: string) {
  const subscription = await subscriptionService.findCurrentByUserId(userId);

  if (!subscription) {
    throw new Error("ACTIVE_SUBSCRIPTION_REQUIRED");
  }

  if (!subscription.plan.extraCreditsAllowed) {
    throw new Error("EXTRA_CREDITS_NOT_ALLOWED");
  }

  const normalizedCode = packCode.trim().toUpperCase();

  const pack = await prisma.creditPack.findUnique({
    where: {
      code: normalizedCode,
    },
  });

  if (!pack) {
    throw new Error("CREDIT_PACK_NOT_FOUND");
  }

  if (!pack.isActive) {
    throw new Error("CREDIT_PACK_INACTIVE");
  }

  if (!pack.stripePriceId) {
    throw new Error("STRIPE_PRICE_NOT_CONFIGURED");
  }

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",

    line_items: [
      {
        price: pack.stripePriceId,
        quantity: 1,
      },
    ],

    success_url: `${frontendUrl}/credits/success?session_id={CHECKOUT_SESSION_ID}`,

    cancel_url: `${frontendUrl}/credits/cancel`,

    client_reference_id: userId,

    metadata: {
      purchaseType: "EXTRA_CREDITS",
      userId,
      packId: pack.id,
      packCode: pack.code,
      credits: String(pack.credits),
    },

    payment_intent_data: {
      metadata: {
        purchaseType: "EXTRA_CREDITS",
        userId,
        packId: pack.id,
        packCode: pack.code,
        credits: String(pack.credits),
      },
    },
  });

  await prisma.extraCreditPurchase.create({
    data: {
      userId,
      packId: pack.id,
      stripeCheckoutSessionId: session.id,
      status: "pending",
      credits: pack.credits,
      amountMinor: pack.priceMinor,
      currency: pack.currency,
    },
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    pack: {
      code: pack.code,
      credits: pack.credits,
      priceMinor: pack.priceMinor,
      currency: pack.currency,
    },
  };
}

async function completePurchase(
  stripeCheckoutSessionId: string,
  stripePaymentIntentId: string | null,
) {
  await prisma.$transaction(async (tx) => {
    const purchase = await tx.extraCreditPurchase.findUnique({
      where: {
        stripeCheckoutSessionId,
      },
    });

    if (!purchase) {
      throw new Error("PURCHASE_NOT_FOUND");
    }

    /*
     * Prevent the same Stripe payment from
     * granting credits more than once.
     */
    const claimed = await tx.extraCreditPurchase.updateMany({
      where: {
        id: purchase.id,
        status: {
          not: "paid",
        },
      },

      data: {
        status: "paid",
        stripePaymentIntentId,
        paidAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return;
    }

    /*
     * Find the user's current active subscription.
     */
    const subscription = await tx.subscription.findFirst({
      where: {
        userId: purchase.userId,

        status: {
          in: ["active", "trialing"],
        },

        currentPeriodEnd: {
          gt: new Date(),
        },

        plan: {
          is: {
            isActive: true,
          },
        },
      },

      include: {
        plan: true,
      },

      orderBy: {
        currentPeriodEnd: "desc",
      },
    });

    if (!subscription) {
      throw new Error("ACTIVE_SUBSCRIPTION_REQUIRED");
    }

    /*
     * If balance already exists:
     *   keep planCredits exactly as they are,
     *   only increase extraCredits.
     *
     * If balance does not exist:
     *   initialize planCredits from the plan,
     *   then add purchased extra credits.
     */
    const balance = await tx.creditBalance.upsert({
      where: {
        userId: purchase.userId,
      },

      update: {
        extraCredits: {
          increment: purchase.credits,
        },
      },

      create: {
        userId: purchase.userId,

        planCredits: subscription.plan.creditsPerPeriod,

        extraCredits: purchase.credits,
      },
    });

    await tx.creditTransaction.create({
      data: {
        balanceId: balance.id,
        type: "EXTRA_CREDIT_PURCHASE",
        bucket: "EXTRA",
        amount: purchase.credits,
        referenceId: purchase.id,
      },
    });
  });
}

async function findActivePacks() {
  return prisma.creditPack.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      credits: "asc",
    },
  });
}

async function getBalanceByUserId(userId: string) {
  return prisma.creditBalance.findUnique({
    where: {
      userId,
    },
  });
}

async function findPurchasesByUserId(userId: string) {
  return prisma.extraCreditPurchase.findMany({
    where: {
      userId,
    },
    include: {
      pack: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export const extraCreditService = {
  createCheckoutSession,
  completePurchase,
  findActivePacks,
  getBalanceByUserId,
  findPurchasesByUserId,
};
