import { Router } from "express";
import { config } from "../config/env";
import { createServiceProxy } from "../proxy/proxyFactory";
import { authRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// 1. User & Authentication Service (Port 3001)
router.use(
  "/api/auth",
  authRateLimiter,
  createServiceProxy({
    target: config.services.userServiceUrl,
  }),
);

router.use(
  "/api/users",
  createServiceProxy({
    target: config.services.userServiceUrl,
  }),
);

router.use(
  "/api/consents",
  createServiceProxy({
    target: config.services.userServiceUrl,
  }),
);

router.use(
  "/api/sessions",
  createServiceProxy({
    target: config.services.userServiceUrl,
  }),
);

// 2. Subscription & Payment Service (Port 3002)
router.use(
  "/api/plans",
  createServiceProxy({
    target: config.services.subscriptionServiceUrl,
  }),
);

router.use(
  "/api/subscriptions",
  createServiceProxy({
    target: config.services.subscriptionServiceUrl,
  }),
);

router.use(
  "/api/payments",
  createServiceProxy({
    target: config.services.subscriptionServiceUrl,
  }),
);

router.use(
  "/api/webhooks/stripe",
  createServiceProxy({
    target: config.services.subscriptionServiceUrl,
  }),
);

// 3. Reporting Service (Port 3003)
router.use(
  "/api/reports",
  createServiceProxy({
    target: config.services.reportingServiceUrl,
  }),
);

// 4. Static Analysis Service (Port 8001)
router.use(
  "/api/analysis/static",
  createServiceProxy({
    target: config.services.staticAnalysisServiceUrl,
  }),
);

// 5. RAG & LLM Service (Port 8002)
router.use(
  "/api/analysis/rag",
  createServiceProxy({
    target: config.services.ragLlmServiceUrl,
  }),
);

// 6. Exploit Agent Service (Port 8003)
router.use(
  "/api/audits",
  createServiceProxy({
    target: config.services.exploitAgentServiceUrl,
    timeoutMs: 120000,
  }),
);

router.use(
  "/api/simulation",
  createServiceProxy({
    target: config.services.exploitAgentServiceUrl,
    timeoutMs: 180000,
  }),
);

// 7. Sandboxed Execution Service (Port 8004)
router.use(
  "/api/sandbox",
  createServiceProxy({
    target: config.services.sandboxedExecutionServiceUrl,
    timeoutMs: 120000,
  }),
);

// 8. Support Service (Port 3004)
router.use(
  "/api/support",
  createServiceProxy({
    target: config.services.supportServiceUrl,
  }),
);

export default router;
