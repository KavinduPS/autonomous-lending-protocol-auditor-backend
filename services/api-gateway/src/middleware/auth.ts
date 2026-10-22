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
  { path: "/api/auth/signout", method: "POST" },
  { path: "/api/auth/google", method: "POST" },
  { path: "/api/auth/refresh", method: "POST" },
  { path: "/api/plans", method: "GET" },
  { path: "/api/webhooks/stripe", method: "POST" },
  { path: "/api/support/inbound-email", method: "POST" },
];

function isPublicRoute(req: Request): boolean {
  const urlPath = req.originalUrl.split("?")[0];
  return PUBLIC_PATHS.some((route) => {
    const methodMatches =
      !route.method || route.method.toUpperCase() === req.method.toUpperCase();
    if (!methodMatches) return false;

    if (typeof route.path === "string") {
      return urlPath === route.path;
    }
    return route.path.test(urlPath);
  });
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  delete req.headers["x-user-id"];
  delete req.headers["x-user-role"];
  delete req.headers["x-user-email"];

  if (req.method === "OPTIONS") {
    return next();
  }

  if (isPublicRoute(req)) {
    return next();
  }

  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication cookie missing.",
      },
      requestId: (req as any).id,
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
    }) as AuthenticatedUser;
    if (!decoded.userId) {
      res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid authentication token.",
        },
        requestId: (req as any).id,
      });
      return;
    }

    req.user = decoded;

    req.headers["x-user-id"] = String(decoded.userId);
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
          ? "Session has expired."
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
