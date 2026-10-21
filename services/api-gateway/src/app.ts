import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config/env";
import { requestIdMiddleware } from "./middleware/requestId";
import { authMiddleware } from "./middleware/auth";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { notFoundHandler, globalErrorHandler } from "./middleware/errorHandler";
import healthRoutes from "./routes/health.routes";
import gatewayRoutes from "./routes/gateway.routes";
import cookieParser from "cookie-parser";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  app.use(cookieParser());
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );

  app.use(requestIdMiddleware);

  morgan.token("request-id", (req: any) => req.id || "-");
  app.use(
    morgan(
      '[:date[iso]] [:request-id] ":method :url" :status :response-time ms - :res[content-length]',
    ),
  );

  app.use(globalRateLimiter);

  app.use(healthRoutes);

  app.use(authMiddleware);

  app.use(gatewayRoutes);

  app.use(notFoundHandler);

  app.use(globalErrorHandler);

  return app;
}
