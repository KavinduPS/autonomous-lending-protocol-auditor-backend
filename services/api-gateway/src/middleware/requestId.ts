import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingId = req.headers["x-request-id"];
  const requestId =
    typeof incomingId === "string" && incomingId.length > 0
      ? incomingId
      : crypto.randomUUID();

  (req as any).id = requestId;

  res.setHeader("X-Request-Id", requestId);

  next();
}
