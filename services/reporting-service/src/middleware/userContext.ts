import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Guards /api/reports routes: reads the user id the gateway forwards. */
export function userContext(req: Request, res: Response, next: NextFunction) {
  const userId = req.header("x-user-id")?.trim();
  if (!userId) {
    return res.status(401).json({ message: "Missing x-user-id" });
  }
  req.userId = userId;
  next();
}
