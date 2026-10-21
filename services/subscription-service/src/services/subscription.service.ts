import { prisma } from "../config/database.js";

export interface CreateSubscriptionInput {
  userId: string;
  planId: string;
  status: string;

  // FREE plan does not require Stripe.
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;

  currentPeriodEnd: Date;
}

export interface UpdateSubscriptionStatusInput {
  status: string;
  currentPeriodEnd?: Date;
}
export interface SyncStripeSubscriptionInput {
  userId: string;
  planId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date | null;
}
/**
 * Find subscription by subscription ID.
 */
async function findById(id: string) {
  return prisma.subscription.findUnique({
    where: {
      id,
    },
    include: {
      plan: true,
    },
  });
}

/**
 * Get all subscription records belonging to a user.
 *
 * Useful for subscription history.
 */
async function findByUserId(userId: string) {
  return prisma.subscription.findMany({
    where: {
      userId,
    },
    include: {
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get the user's latest subscription record.
 *
 * This may be active, canceled, expired, past_due, etc.
 * Useful for eligibility checks because the controller can explain
 * why the subscription is not eligible.
 */
async function findLatestByUserId(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
    },
    include: {
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get the user's currently valid subscription.
 *
 * Conditions:
 * - status must be active or trialing
 * - currentPeriodEnd must be in the future
 * - selected plan must still be active
 */
async function findCurrentByUserId(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,

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
}

/**
 * Create a new subscription.
 */
async function create(data: CreateSubscriptionInput) {
  return prisma.subscription.create({
    data: {
      userId: data.userId,
      planId: data.planId,
      status: data.status,

      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,

      currentPeriodEnd: data.currentPeriodEnd,
    },

    include: {
      plan: true,
    },
  });
}

/**
 * Update subscription status.
 */
async function updateStatus(id: string, data: UpdateSubscriptionStatusInput) {
  return prisma.subscription.update({
    where: {
      id,
    },

    data: {
      status: data.status,

      ...(data.currentPeriodEnd !== undefined
        ? {
            currentPeriodEnd: data.currentPeriodEnd,
          }
        : {}),
    },

    include: {
      plan: true,
    },
  });
}

async function remove(id: string) {
  return prisma.subscription.delete({
    where: {
      id,
    },
  });
}

async function syncStripeSubscription(data: SyncStripeSubscriptionInput) {
  return prisma.subscription.upsert({
    where: {
      stripeSubscriptionId: data.stripeSubscriptionId,
    },

    update: {
      userId: data.userId,
      planId: data.planId,
      stripeCustomerId: data.stripeCustomerId,
      status: data.status,
      currentPeriodEnd: data.currentPeriodEnd,
    },

    create: {
      userId: data.userId,
      planId: data.planId,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      status: data.status,
      currentPeriodEnd: data.currentPeriodEnd,
    },

    include: {
      plan: true,
    },
  });
}

export const subscriptionService = {
  findById,
  findByUserId,
  findLatestByUserId,
  findCurrentByUserId,
  create,
  updateStatus,
  remove,
  syncStripeSubscription,
};
