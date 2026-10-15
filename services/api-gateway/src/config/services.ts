import { config } from "./env";

export interface ServiceDefinition {
  name: string;
  url: string;
  pathPrefix: string;
  healthEndpoint: string;
  description: string;
}

export const services: Record<string, ServiceDefinition> = {
  user: {
    name: "user-service",
    url: config.services.userServiceUrl,
    pathPrefix: "/api/users",
    healthEndpoint: `${config.services.userServiceUrl}/health`,
    description:
      "Manages users, authentication, sessions, consents, and security events",
  },
  auth: {
    name: "user-service-auth",
    url: config.services.userServiceUrl,
    pathPrefix: "/api/auth",
    healthEndpoint: `${config.services.userServiceUrl}/health`,
    description: "User authentication, token issue, refresh, and logout",
  },
  subscription: {
    name: "subscription-service",
    url: config.services.subscriptionServiceUrl,
    pathPrefix: "/api/subscriptions",
    healthEndpoint: `${config.services.subscriptionServiceUrl}/health`,
    description:
      "Subscription tier verification, quota tracking, plans, and Stripe payments",
  },
  plans: {
    name: "subscription-service-plans",
    url: config.services.subscriptionServiceUrl,
    pathPrefix: "/api/plans",
    healthEndpoint: `${config.services.subscriptionServiceUrl}/health`,
    description: "Available subscription plans and exploit simulation quotas",
  },
  payments: {
    name: "subscription-service-payments",
    url: config.services.subscriptionServiceUrl,
    pathPrefix: "/api/payments",
    healthEndpoint: `${config.services.subscriptionServiceUrl}/health`,
    description: "Payment invoices and payment history",
  },
  stripeWebhooks: {
    name: "subscription-service-webhooks",
    url: config.services.subscriptionServiceUrl,
    pathPrefix: "/api/webhooks/stripe",
    healthEndpoint: `${config.services.subscriptionServiceUrl}/health`,
    description: "Stripe payment event webhooks",
  },
  reporting: {
    name: "reporting-service",
    url: config.services.reportingServiceUrl,
    pathPrefix: "/api/reports",
    healthEndpoint: `${config.services.reportingServiceUrl}/health`,
    description:
      "Generates final security audit reports, comparisons, and PDF downloads",
  },
  staticAnalysis: {
    name: "static-analysis-service",
    url: config.services.staticAnalysisServiceUrl,
    pathPrefix: "/api/analysis/static",
    healthEndpoint: `${config.services.staticAnalysisServiceUrl}/health`,
    description:
      "Static analysis and AST scanning for lending protocol vulnerabilities",
  },
  ragLlm: {
    name: "rag-llm-service",
    url: config.services.ragLlmServiceUrl,
    pathPrefix: "/api/analysis/rag",
    healthEndpoint: `${config.services.ragLlmServiceUrl}/health`,
    description:
      "RAG knowledge base querying and LLM-guided vulnerability hypothesis generation",
  },
  audits: {
    name: "exploit-agent-service-audits",
    url: config.services.exploitAgentServiceUrl,
    pathPrefix: "/api/audits",
    healthEndpoint: `${config.services.exploitAgentServiceUrl}/health`,
    description:
      "Audit job lifecycle, triage findings, and exploit agent orchestration",
  },
  simulation: {
    name: "exploit-agent-service-sim",
    url: config.services.exploitAgentServiceUrl,
    pathPrefix: "/api/simulation",
    healthEndpoint: `${config.services.exploitAgentServiceUrl}/health`,
    description: "Autonomous exploit simulation loop and PoC generation",
  },
  sandbox: {
    name: "sandboxed-execution-service",
    url: config.services.sandboxedExecutionServiceUrl,
    pathPrefix: "/api/sandbox",
    healthEndpoint: `${config.services.sandboxedExecutionServiceUrl}/health`,
    description:
      "Isolated forked blockchain execution environment (Anvil/Hardhat)",
  },
};
