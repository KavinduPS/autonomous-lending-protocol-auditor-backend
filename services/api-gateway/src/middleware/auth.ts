import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Whitelist of public routes that bypass JWT verification
const PUBLIC_PATHS: Array<{ path: string | RegExp; method?: string }> = [
  { path: "/health" },
  { path: "/health/services" },
  { path: "/api/auth/signin", method: "POST" },
  { path: "/api/auth/signup", method: "POST" },
  { path: "/api/auth/login", method: "POST" },
  { path: "/api/auth/register", method: "POST" },
  { path: "/api/auth/google", method: "POST" },
  { path: "/api/auth/refresh", method: "POST" },
  { path: "/api/plans", method: "GET" },
  { path: "/api/webhooks/stripe", method: "POST" },
];

function isPublicRoute(req: Request): boolean {
  return PUBLIC_PATHS.some((route) => {
    const methodMatches =
      !route.method || route.method.toUpperCase() === req.method.toUpperCase();
    if (!methodMatches) return false;

    if (typeof route.path === "string") {
      return req.path === route.path || req.originalUrl.startsWith(route.path);
    }
    return route.path.test(req.path);
  });
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (isPublicRoute(req)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Authentication token missing or invalid format. Expected 'Bearer <token>'.",
      },
      requestId: (req as any).id,
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthenticatedUser;
    req.user = decoded;

    if (decoded.userId) {
      req.headers["x-user-id"] = decoded.userId;
    }
    if (decoded.role) {
      req.headers["x-user-role"] = decoded.role;
    }
    if (decoded.email) {
      req.headers["x-user-email"] = decoded.email;
    }

    next();
  } catch (error: any) {
    const isExpired = error.name === "TokenExpiredError";
    res.status(401).json({
      success: false,
      error: {
        code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        message: isExpired
          ? "Access token has expired."
          : "Invalid authentication token.",
      },
      requestId: (req as any).id,
    });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `Access denied. Requires one of roles: [${allowedRoles.join(", ")}]`,
        },
        requestId: (req as any).id,
      });
      return;
    }
    next();
  };
}
