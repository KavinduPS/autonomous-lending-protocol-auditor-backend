import { prisma } from "../src/config/database.js";

async function main() {
  /*
   * ==================================================
   * SUBSCRIPTION PLANS
   * ==================================================
   */

  const plans = [
    {
      code: "FREE",
      stripePriceId: null,
      priceMinor: BigInt(0),
      currency: "usd",
      creditsPerPeriod: 20,
      exploitSimulation: false,
      extraCreditsAllowed: false,
      maxConcurrentAudits: 1,
      queuePriority: "STANDARD",
      apiAccess: false,
      isActive: true,
    },
    {
      code: "BASIC",
      stripePriceId: "price_1USDm3D2pTARexy76vqDLhV1",
      priceMinor: BigInt(5000),
      currency: "usd",
      creditsPerPeriod: 100,
      exploitSimulation: true,
      extraCreditsAllowed: true,
      maxConcurrentAudits: 1,
      queuePriority: "STANDARD",
      apiAccess: false,
      isActive: true,
    },
    {
      code: "PRO",
      stripePriceId: "price_1USDmaD2pTARexy7of9YPsAl",
      priceMinor: BigInt(20000),
      currency: "usd",
      creditsPerPeriod: 400,
      exploitSimulation: true,
      extraCreditsAllowed: true,
      maxConcurrentAudits: 2,
      queuePriority: "HIGH",
      apiAccess: true,
      isActive: true,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: {
        code: plan.code,
      },

      update: {
        stripePriceId: plan.stripePriceId,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        creditsPerPeriod: plan.creditsPerPeriod,
        exploitSimulation: plan.exploitSimulation,
        extraCreditsAllowed: plan.extraCreditsAllowed,
        maxConcurrentAudits: plan.maxConcurrentAudits,
        queuePriority: plan.queuePriority,
        apiAccess: plan.apiAccess,
        isActive: plan.isActive,
      },

      create: plan,
    });
  }

  console.log("FREE, BASIC and PRO plans seeded successfully");

  /*
   * ==================================================
   * EXTRA CREDIT PACKS
   * ==================================================
   */

  const creditPacks = [
    {
      code: "EXTRA_25",
      credits: 25,
      stripePriceId: process.env.STRIPE_EXTRA_25_PRICE_ID,
      priceMinor: process.env.EXTRA_25_PRICE_MINOR,
    },
    {
      code: "EXTRA_50",
      credits: 50,
      stripePriceId: process.env.STRIPE_EXTRA_50_PRICE_ID,
      priceMinor: process.env.EXTRA_50_PRICE_MINOR,
    },
    {
      code: "EXTRA_75",
      credits: 75,
      stripePriceId: process.env.STRIPE_EXTRA_75_PRICE_ID,
      priceMinor: process.env.EXTRA_75_PRICE_MINOR,
    },
    {
      code: "EXTRA_100",
      credits: 100,
      stripePriceId: process.env.STRIPE_EXTRA_100_PRICE_ID,
      priceMinor: process.env.EXTRA_100_PRICE_MINOR,
    },
    {
      code: "EXTRA_125",
      credits: 125,
      stripePriceId: process.env.STRIPE_EXTRA_125_PRICE_ID,
      priceMinor: process.env.EXTRA_125_PRICE_MINOR,
    },
    {
      code: "EXTRA_150",
      credits: 150,
      stripePriceId: process.env.STRIPE_EXTRA_150_PRICE_ID,
      priceMinor: process.env.EXTRA_150_PRICE_MINOR,
    },
  ];

  for (const pack of creditPacks) {
    if (!pack.stripePriceId || !pack.priceMinor) {
      console.warn(
        `${pack.code} was not seeded because Stripe Price ID or price is missing`,
      );

      continue;
    }

    const parsedPriceMinor = BigInt(pack.priceMinor);

    await prisma.creditPack.upsert({
      where: {
        code: pack.code,
      },

      update: {
        credits: pack.credits,
        priceMinor: parsedPriceMinor,
        currency: "usd",
        stripePriceId: pack.stripePriceId,
        isActive: true,
      },

      create: {
        code: pack.code,
        credits: pack.credits,
        priceMinor: parsedPriceMinor,
        currency: "usd",
        stripePriceId: pack.stripePriceId,
        isActive: true,
      },
    });

    console.log(`${pack.code} seeded successfully`);
  }

  console.log("Database seed completed successfully");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
