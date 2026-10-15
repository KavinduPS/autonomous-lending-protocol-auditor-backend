import rateLimit from "express-rate-limit";
import { config } from "../config/env";

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please slow down and try again later.",
      },
      requestId: (req as any).id,
    });
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_AUTH_ATTEMPTS",
        message:
          "Too many login/auth attempts from this IP. Please try again after 15 minutes.",
      },
      requestId: (req as any).id,
    });
  },
});
