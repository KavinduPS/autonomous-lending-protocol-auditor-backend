import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwtSecret:
    process.env.JWT_SECRET || "super-secret-jwt-key-change-in-production",

  services: {
    userServiceUrl: process.env.USER_SERVICE_URL || "http://localhost:3001",
    subscriptionServiceUrl:
      process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:3002",
    reportingServiceUrl:
      process.env.REPORTING_SERVICE_URL || "http://localhost:3003",
    staticAnalysisServiceUrl:
      process.env.STATIC_ANALYSIS_SERVICE_URL || "http://localhost:8001",
    ragLlmServiceUrl:
      process.env.RAG_LLM_SERVICE_URL || "http://localhost:8002",
    exploitAgentServiceUrl:
      process.env.EXPLOIT_AGENT_SERVICE_URL || "http://localhost:8003",
    sandboxedExecutionServiceUrl:
      process.env.SANDBOXED_EXECUTION_SERVICE_URL || "http://localhost:8004",
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 mins
    maxRequests: Number(process.env.RATE_LIMIT_MAX) || 200,
    authMaxRequests: Number(process.env.RATE_LIMIT_AUTH_MAX) || 20,
  },
};
