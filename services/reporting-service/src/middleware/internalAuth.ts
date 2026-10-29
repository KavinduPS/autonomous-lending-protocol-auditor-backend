import type { NextFunction, Request, Response } from "express";

/** Guards /internal routes: x-service-key must equal INTERNAL_API_KEY. */
export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || req.header("x-service-key") !== key) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}
