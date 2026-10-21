import express from "express";
import { prisma } from "./config/database.js";
import planRoutes from "./routes/plan.routes.js";
import subscriptionRoutes from "./routes/subscriptions.routes.js";
import stripeRoutes from "./routes/stripe.routes.js";
import { stripeWebhook } from "./controllers/stripe-webhook.controller.js";
import extraCreditRoutes from "./routes/extra-credit.routes.js";

const app = express();

const port = Number(process.env.PORT) || 3002;

app.post(
  "/stripe/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeWebhook,
);
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({
    service: "subscription-service",
    status: "ok",
  });
});
app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      service: "subscription-service",
      database: "connected",
      status: "ready",
    });
  } catch (error) {
    console.error("Database readiness check failed:", error);

    res.status(503).json({
      service: "subscription-service",
      database: "disconnected",
      status: "not-ready",
    });
  }
});
app.use("/plans", planRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/stripe", stripeRoutes);
app.use("/extra-credits", extraCreditRoutes);

const server = app.listen(port, () => {
  console.log(`subscription-service on ${port}`);
});

async function shutdown() {
  server.close();

  await prisma.$disconnect();

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
