import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`API Gateway running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Health check: http://localhost:${config.port}/health`);
  console.log(
    `Services monitor: http://localhost:${config.port}/health/services`,
  );
});

// shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(
    `\n[API-GATEWAY] Received ${signal}. Closing HTTP server gracefully...`,
  );
  server.close(() => {
    console.log("[API-GATEWAY] HTTP server closed. Process terminating.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[API-GATEWAY] Forcefully shutting down after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
