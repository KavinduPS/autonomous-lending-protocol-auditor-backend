import express, { Express, Request, Response, Router } from "express";
import { handleExecuteRequest, ValidationError } from "./executeHandler.js";

export function createServer(): Express {
  const app = express();

  app.use(express.json({ limit: "10mb" }));

  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      service: "sandboxed-execution-service",
      status: "ok",
    });
  });

  router.post("/execute", async (req: Request, res: Response) => {
    try {
      const result = await handleExecuteRequest(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }

      console.error("[sandboxed-execution-service] Execution error:", error);
      res.status(500).json({ error: "Internal execution server error" });
    }
  });

  app.use("/", router);
  app.use("/api/sandbox", router);

  return app;
}
