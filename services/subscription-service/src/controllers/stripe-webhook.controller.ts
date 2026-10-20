import type { Request, Response } from "express";
import type Stripe from "stripe";

import { stripe } from "../config/stripe.js";
import { prisma } from "../config/database.js";
import { subscriptionService } from "../services/subscription.service.js";
import { extraCreditService } from "../services/extra-credit.service.js";

/*
 * Extract a Stripe ID from either:
 * - "cus_xxx" / "sub_xxx" / "pi_xxx"
 * - expanded Stripe object
 * - null
 */
function getStripeId(value: string | { id: string } | null): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.id;
}

/*
 * Stripe API versions can expose the period end
 * slightly differently.
 */
function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const subscriptionWithPeriod = subscription as Stripe.Subscription & {
    current_period_end?: number;
  };

  if (typeof subscriptionWithPeriod.current_period_end === "number") {
    return new Date(subscriptionWithPeriod.current_period_end * 1000);
  }

  const firstItem = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_end?: number;
      })
    | undefined;

  if (firstItem && typeof firstItem.current_period_end === "number") {
    return new Date(firstItem.current_period_end * 1000);
  }

  return null;
}

/*
 * Synchronize a Stripe subscription with our database.
 */
async function synchronizeSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const planId = subscription.metadata?.planId;

  if (!userId || !planId) {
    console.warn(
      "Stripe subscription missing userId or planId metadata:",
      subscription.id,
    );

    return;
  }

  const stripeCustomerId = getStripeId(subscription.customer);

  const currentPeriodEnd = getCurrentPeriodEnd(subscription);

  await subscriptionService.syncStripeSubscription({
    userId,
    planId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd,
  });

  console.log(`Stripe subscription synchronized: ${subscription.id}`);
}

/*
 * Complete an extra-credit purchase after Stripe confirms payment.
 */
async function handleExtraCreditPurchase(session: Stripe.Checkout.Session) {
  if (session.metadata?.purchaseType !== "EXTRA_CREDITS") {
    return;
  }

  /*
   * Do not grant credits until Stripe says payment
   * has actually been completed.
   */
  if (session.payment_status !== "paid") {
    console.log(`Extra-credit checkout ${session.id} is not paid yet`);

    return;
  }

  const stripePaymentIntentId = getStripeId(session.payment_intent);

  await extraCreditService.completePurchase(session.id, stripePaymentIntentId);

  console.log(`Extra credits granted for Checkout Session ${session.id}`);
}

export async function stripeWebhook(req: Request, res: Response) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");

    return res.status(500).json({
      message: "Stripe webhook is not configured",
    });
  }

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      message: "Missing Stripe signature",
    });
  }

  let event: Stripe.Event;

  /*
   * STEP 1:
   * Verify the webhook signature using the RAW body.
   */
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);

    return res.status(400).json({
      message: "Invalid Stripe webhook signature",
    });
  }

  try {
    /*
     * STEP 2:
     * Check whether we already processed this Stripe event.
     */
    const existingEvent = await prisma.stripeEvent.findUnique({
      where: {
        stripeEventId: event.id,
      },
    });

    if (existingEvent?.status === "processed") {
      return res.status(200).json({
        received: true,
        duplicate: true,
      });
    }

    /*
     * Save the Stripe event before processing it.
     */
    await prisma.stripeEvent.upsert({
      where: {
        stripeEventId: event.id,
      },

      update: {
        eventType: event.type,
        payload: JSON.parse(JSON.stringify(event)),
        status: "processing",
      },

      create: {
        stripeEventId: event.id,
        eventType: event.type,
        payload: JSON.parse(JSON.stringify(event)),
        status: "processing",
      },
    });

    /*
     * STEP 3:
     * Handle the Stripe event.
     */
    switch (event.type) {
      /*
       * Checkout completed.
       *
       * This can be:
       * 1. BASIC/PRO subscription checkout
       * 2. Extra-credit one-time payment
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        /*
         * EXTRA CREDIT PURCHASE
         */
        if (
          session.mode === "payment" &&
          session.metadata?.purchaseType === "EXTRA_CREDITS"
        ) {
          await handleExtraCreditPurchase(session);

          break;
        }

        /*
         * SUBSCRIPTION CHECKOUT
         */
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = getStripeId(session.subscription);

          if (subscriptionId) {
            const subscription =
              await stripe.subscriptions.retrieve(subscriptionId);

            await synchronizeSubscription(subscription);
          }
        }

        break;
      }

      /*
       * Some payment methods are asynchronous.
       *
       * checkout.session.completed can happen before
       * payment is finally confirmed.
       */
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (
          session.mode === "payment" &&
          session.metadata?.purchaseType === "EXTRA_CREDITS"
        ) {
          await handleExtraCreditPurchase(session);
        }

        break;
      }

      /*
       * Stripe created a paid subscription.
       */
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;

        await synchronizeSubscription(subscription);

        break;
      }

      /*
       * Stripe changed subscription status,
       * period, plan state, etc.
       */
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        await synchronizeSubscription(subscription);

        break;
      }

      /*
       * Stripe canceled/deleted subscription.
       */
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        await synchronizeSubscription(subscription);

        break;
      }

      default: {
        console.log(`Unhandled Stripe event: ${event.type}`);
      }
    }

    /*
     * STEP 4:
     * Event processed successfully.
     */
    await prisma.stripeEvent.update({
      where: {
        stripeEventId: event.id,
      },

      data: {
        status: "processed",
      },
    });

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error(`Failed processing Stripe event ${event.id}:`, error);

    /*
     * Save failed state so we can debug/retry.
     */
    try {
      await prisma.stripeEvent.update({
        where: {
          stripeEventId: event.id,
        },

        data: {
          status: "failed",
        },
      });
    } catch (updateError) {
      console.error("Failed to update Stripe event status:", updateError);
    }

    return res.status(500).json({
      message: "Stripe webhook processing failed",
    });
  }
}
