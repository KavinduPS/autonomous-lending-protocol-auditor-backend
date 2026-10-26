import express, { Express } from "express";
import cors from "cors";
import ticketRoutes from "./routes/ticket.routes.js";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      service: "support-service",
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/support", ticketRoutes);

  return app;
}
