import { Router, Request, Response } from "express";
import { config } from "../config/env";

const router = Router();

// List of all microservices to monitor
const SERVICES_TO_CHECK = [
  { name: "user-service", url: `${config.services.userServiceUrl}/health` },
  {
    name: "subscription-service",
    url: `${config.services.subscriptionServiceUrl}/health`,
  },
  {
    name: "reporting-service",
    url: `${config.services.reportingServiceUrl}/health`,
  },
  {
    name: "static-analysis-service",
    url: `${config.services.staticAnalysisServiceUrl}/health`,
  },
  {
    name: "rag-llm-service",
    url: `${config.services.ragLlmServiceUrl}/health`,
  },
  {
    name: "exploit-agent-service",
    url: `${config.services.exploitAgentServiceUrl}/health`,
  },
  {
    name: "sandboxed-execution-service",
    url: `${config.services.sandboxedExecutionServiceUrl}/health`,
  },
];

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    service: "api-gateway",
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
  });
});

router.get("/health/services", async (_req: Request, res: Response) => {
  const checkService = async (service: { name: string; url: string }) => {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(service.url, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = "ok";
        }
        return {
          name: service.name,
          url: service.url,
          status: "UP",
          statusCode: response.status,
          latencyMs,
          details: data,
        };
      }

      return {
        name: service.name,
        url: service.url,
        status: "DOWN",
        statusCode: response.status,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    } catch (err: any) {
      return {
        name: service.name,
        url: service.url,
        status: "DOWN",
        latencyMs: Date.now() - startTime,
        error:
          err.name === "AbortError"
            ? "Health check timed out (3s)"
            : err.message,
      };
    }
  };

  const results = await Promise.all(SERVICES_TO_CHECK.map(checkService));
  const allUp = results.every((r) => r.status === "UP");
  const upCount = results.filter((r) => r.status === "UP").length;

  res.status(allUp ? 200 : 207).json({
    gateway: {
      status: "ok",
      uptime: Math.floor(process.uptime()),
    },
    systemSummary: {
      totalServices: SERVICES_TO_CHECK.length,
      upServices: upCount,
      allHealthy: allUp,
    },
    services: results,
  });
});

export default router;
